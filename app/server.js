#!/usr/bin/env node
/**
 * One-page reentrancy analyzer UI + vulnerable-contract risk registry agent.
 *
 * Prefer:  npm run analyze-ui
 */
require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyzeTransaction, analyzeFromFormat2, analyzeDataset, listConfiguredNetworks } = require("./analyze.js");
const {
    recordFromAnalysis,
    listVulnerableContracts,
    getVulnerableContract,
    assessContractWithAi,
    getAiStatus
} = require("./riskRegistry.js");
const {
    assessDraftTransaction,
    attachAiBriefing,
    recordHumanDecision,
    getAssessment
} = require("./txRiskAssess.js");

const PORT = Number(process.env.PORT || process.env.ANALYZE_UI_PORT || 3857);
const HOST = process.env.ANALYZE_UI_HOST || "127.0.0.1";
const PUBLIC_MODE =
    String(process.env.PUBLIC_MODE || "").toLowerCase() === "true" ||
    HOST === "0.0.0.0";
const PUBLIC_AI = String(process.env.PUBLIC_AI || "").toLowerCase() === "true";
const MAX_BODY_BYTES = Number(process.env.ANALYZE_UI_MAX_BODY_MB || 64) * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = Number(process.env.ANALYZE_UI_RATE_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.ANALYZE_UI_RATE_MAX || (PUBLIC_MODE ? 20 : 120));
const DATASET_MAX_ROWS = Number(process.env.ANALYZE_UI_DATASET_MAX_ROWS || (PUBLIC_MODE ? 100 : 500));
const PUBLIC_DIR = path.join(__dirname, "public");

/** Simple in-memory rate limit: ip -> { count, resetAt } */
const rateBuckets = new Map();

function clientIp(req) {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
}

function rateLimitOk(req) {
    const ip = clientIp(req);
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateBuckets.set(ip, bucket);
    }
    bucket.count += 1;
    return bucket.count <= RATE_LIMIT_MAX;
}

function allowAiForPublic() {
    if (!PUBLIC_MODE) return true;
    return PUBLIC_AI;
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
    const payload = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on("data", c => {
            if (tooLarge) return;
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => {
            if (tooLarge) {
                reject(
                    Object.assign(
                        new Error(
                            `Request body too large (max ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB). ` +
                                `For big datasets use localhost, or split the JSON into smaller files.`
                        ),
                        { statusCode: 413 }
                    )
                );
                return;
            }
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
    });
}

function serveStatic(req, res) {
    let urlPath = req.url.split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403).end("Forbidden");
        return;
    }
    fs.stat(filePath, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404).end("Not found");
            return;
        }
        const ext = path.extname(filePath);
        const headers = {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Content-Length": st.size,
            "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300"
        };
        if (req.method === "HEAD") {
            res.writeHead(200, headers);
            res.end();
            return;
        }
        fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
                res.writeHead(404).end("Not found");
                return;
            }
            res.writeHead(200, headers);
            res.end(data);
        });
    });
}

function maybeRecord(result, context) {
    try {
        if (!result || !result.detection || result.detection.verdict !== "REENTRANCY_DETECTED") {
            return null;
        }
        return recordFromAnalysis(result, context);
    } catch (err) {
        console.warn("[riskRegistry]", err.message || err);
        return { skipped: true, reason: err.message || String(err) };
    }
}

function startServer(port = PORT) {
    const server = http.createServer(async (req, res) => {
        const urlPath = req.url.split("?")[0];

        // Rate-limit mutating API routes in public mode (and lightly in private)
        if (req.method === "POST" && urlPath.startsWith("/api/")) {
            if (!rateLimitOk(req)) {
                return sendJson(res, 429, {
                    error: "Too many requests — slow down and try again shortly."
                });
            }
        }

        if (req.method === "POST" && urlPath === "/api/analyze") {
            try {
                const raw = await readBody(req);
                let body;
                try {
                    body = JSON.parse(raw || "{}");
                } catch {
                    return sendJson(res, 400, { error: "Request body must be JSON" });
                }
                const txHash = String(body.txHash || "").trim();
                const format2 = String(body.format2 || "").trim();
                const network = String(body.network || "sepolia").trim();
                if (!txHash && !format2) {
                    return sendJson(res, 400, { error: "Provide txHash or format2" });
                }
                const result = format2 && !txHash
                    ? analyzeFromFormat2(format2)
                    : await analyzeTransaction(txHash, { network });

                const registry = maybeRecord(result, {
                    txHash: result.txHash || txHash,
                    network: result.network || network,
                    attackName: body.attackName || "sf_reentrancy"
                });
                if (registry) result.riskRegistry = registry;

                return sendJson(res, 200, result);
            } catch (err) {
                const status = err.statusCode || 500;
                console.error("[analyze]", err.message || err);
                return sendJson(res, status, {
                    error: err.message || "Analysis failed"
                });
            }
        }

        if (req.method === "POST" && urlPath === "/api/analyze-dataset") {
            try {
                const raw = await readBody(req);
                let body;
                try {
                    body = JSON.parse(raw || "null");
                } catch {
                    return sendJson(res, 400, { error: "Request body must be JSON" });
                }
                const payload = body && body.dataset !== undefined ? body.dataset : body;
                const network = String((body && body.network) || "sepolia").trim();
                const limit = Math.min(
                    Number(body && body.limit) || DATASET_MAX_ROWS,
                    DATASET_MAX_ROWS
                );
                const offset = Math.max(0, Number(body && body.offset) || 0);
                const result = analyzeDataset(payload, { limit, offset });

                const registryUpdates = [];
                for (const row of result.results || []) {
                    if (!row.detection || row.detection.verdict !== "REENTRANCY_DETECTED") continue;
                    const update = maybeRecord(row, {
                        txHash: row.txHash,
                        network: row.meta && row.meta.chainId === 1 ? "mainnet" : network,
                        chainId: row.meta && row.meta.chainId,
                        blockNumber: row.meta && row.meta.blockNumber,
                        timestamp: row.meta && row.meta.txTimestamp,
                        attackName: "sf_reentrancy"
                    });
                    if (update && !update.skipped) registryUpdates.push(update);
                }
                result.riskRegistryUpdates = registryUpdates;
                result.limits = {
                    maxBodyMb: Math.round(MAX_BODY_BYTES / 1024 / 1024),
                    maxRowsPerRequest: DATASET_MAX_ROWS
                };
                return sendJson(res, 200, result);
            } catch (err) {
                const status = err.statusCode || 500;
                console.error("[analyze-dataset]", err.message || err);
                return sendJson(res, status, {
                    error: err.message || "Dataset analysis failed"
                });
            }
        }

        if (req.method === "GET" && urlPath === "/api/registry") {
            try {
                const q = new URL(req.url, "http://localhost").searchParams;
                const sortBy = q.get("sortBy") || "riskScore";
                return sendJson(res, 200, listVulnerableContracts({ sortBy }));
            } catch (err) {
                return sendJson(res, 500, { error: err.message || "Failed to load registry" });
            }
        }

        if (req.method === "GET" && urlPath === "/api/registry/ai-status") {
            return sendJson(res, 200, getAiStatus());
        }

        if (req.method === "POST" && urlPath.startsWith("/api/registry/") && urlPath.endsWith("/ai-assess")) {
            try {
                if (!allowAiForPublic()) {
                    return sendJson(res, 403, {
                        error: "AI briefings are disabled in public mode. Set PUBLIC_AI=true to enable (uses your API credits)."
                    });
                }
                const parts = urlPath.split("/").filter(Boolean);
                // /api/registry/:chainId/:address/ai-assess
                const chainId = parts[2];
                const address = parts[3];
                if (!chainId || !address) {
                    return sendJson(res, 400, { error: "Use /api/registry/:chainId/:address/ai-assess" });
                }
                const out = await assessContractWithAi(address, chainId);
                return sendJson(res, out.ok ? 200 : 400, out);
            } catch (err) {
                return sendJson(res, 500, { error: err.message || "AI assess failed" });
            }
        }

        if (req.method === "GET" && urlPath.startsWith("/api/registry/")) {
            try {
                const parts = urlPath.split("/").filter(Boolean);
                // /api/registry/:chainId/:address
                const chainId = parts[2];
                const address = parts[3];
                if (!chainId || !address) {
                    return sendJson(res, 400, { error: "Use /api/registry/:chainId/:address" });
                }
                const contract = getVulnerableContract(address, chainId);
                if (!contract) return sendJson(res, 404, { error: "Contract not in registry" });
                return sendJson(res, 200, contract);
            } catch (err) {
                return sendJson(res, 500, { error: err.message || "Failed to load contract" });
            }
        }

        if (req.method === "POST" && urlPath === "/api/tx-risk/assess") {
            try {
                const raw = await readBody(req);
                let body;
                try {
                    body = JSON.parse(raw || "{}");
                } catch {
                    return sendJson(res, 400, { error: "Request body must be JSON" });
                }
                const withAi = body.withAi !== false && allowAiForPublic();
                let assessment = await assessDraftTransaction(body);
                let aiMeta = { skipped: true, reason: "not requested" };
                if (body.withAi !== false && !allowAiForPublic()) {
                    aiMeta = { skipped: true, reason: "AI disabled in public mode (set PUBLIC_AI=true to enable)" };
                }
                if (withAi) {
                    try {
                        aiMeta = await attachAiBriefing(assessment, { force: true });
                        assessment = aiMeta.assessment;
                    } catch (err) {
                        aiMeta = { skipped: true, reason: err.message || String(err) };
                    }
                }
                return sendJson(res, 200, {
                    assessment,
                    ai: {
                        enabled: getAiStatus().enabled,
                        skipped: aiMeta.skipped,
                        reason: aiMeta.reason || null
                    }
                });
            } catch (err) {
                const status = err.statusCode || 500;
                console.error("[tx-risk]", err.message || err);
                return sendJson(res, status, { error: err.message || "Pre-tx assessment failed" });
            }
        }

        if (req.method === "POST" && urlPath === "/api/tx-risk/decide") {
            try {
                const raw = await readBody(req);
                let body;
                try {
                    body = JSON.parse(raw || "{}");
                } catch {
                    return sendJson(res, 400, { error: "Request body must be JSON" });
                }
                const out = recordHumanDecision(body.assessmentId, body.decision, body.note);
                return sendJson(res, 200, out);
            } catch (err) {
                const status = err.statusCode || 500;
                return sendJson(res, status, { error: err.message || "Decision failed" });
            }
        }

        if (req.method === "GET" && urlPath.startsWith("/api/tx-risk/")) {
            try {
                const id = urlPath.split("/").filter(Boolean)[2];
                if (!id) return sendJson(res, 400, { error: "Use /api/tx-risk/:assessmentId" });
                const assessment = getAssessment(id);
                if (!assessment) return sendJson(res, 404, { error: "Assessment not found" });
                return sendJson(res, 200, assessment);
            } catch (err) {
                return sendJson(res, 500, { error: err.message || "Lookup failed" });
            }
        }

        if ((req.method === "GET" || req.method === "HEAD") && urlPath === "/api/health") {
            if (req.method === "HEAD") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
                return res.end();
            }
            return sendJson(res, 200, {
                ok: true,
                app: "YU-SAM Power",
                publicMode: PUBLIC_MODE,
                publicAi: allowAiForPublic(),
                networks: listConfiguredNetworks(),
                riskAi: getAiStatus()
            });
        }

        if (req.method === "GET" || req.method === "HEAD") {
            return serveStatic(req, res);
        }

        return sendJson(res, 405, {
            error: "Method not allowed. Restart with: npm run analyze-ui"
        });
    });

    server.listen(port, HOST, () => {
        const where = HOST === "0.0.0.0" ? `http://<your-ip>:${port}` : `http://${HOST}:${port}`;
        console.log(`YU-SAM Power UI → http://localhost:${port} (bind ${HOST})`);
        if (PUBLIC_MODE) {
            console.log(`Public mode ON — rate limit ${RATE_LIMIT_MAX}/min/IP, AI ${allowAiForPublic() ? "enabled" : "disabled"}`);
            console.log(`LAN/public bind: ${where}`);
        }
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };
