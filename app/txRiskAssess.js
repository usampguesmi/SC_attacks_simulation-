/**
 * Instant pre-transaction risk assessment (human-in-the-loop).
 *
 * Before broadcast, evaluate a draft tx against the vulnerable-contract ledger
 * and on-chain signals. Deterministic score first; optional AI narrative.
 * Human then CONTINUEs or ABORTs — decision is logged.
 *
 * Does NOT send transactions.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
    loadRegistry,
    getVulnerableContract,
    resolveChainId
} = require("./riskRegistry.js");
const { aiEnabled } = require("./riskAgent.js");

const DATA_DIR = process.env.YU_SAM_DATA_DIR
    ? path.resolve(process.env.YU_SAM_DATA_DIR)
    : path.join(__dirname, "../data");
const DECISIONS_PATH = path.join(DATA_DIR, "tx_risk_decisions.json");

function emptyStore() {
    return { version: 1, updatedAt: null, assessments: [], decisions: [] };
}

function ensureStore() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DECISIONS_PATH)) {
        fs.writeFileSync(DECISIONS_PATH, JSON.stringify(emptyStore(), null, 2));
    }
}

function loadStore() {
    ensureStore();
    try {
        const data = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
        if (!data || !Array.isArray(data.assessments)) return emptyStore();
        return data;
    } catch {
        return emptyStore();
    }
}

function saveStore(store) {
    ensureStore();
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(DECISIONS_PATH, JSON.stringify(store, null, 2));
}

function normalizeAddress(addr) {
    if (!addr || typeof addr !== "string") return null;
    const a = addr.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
    return a;
}

function parseValueWei(body) {
    if (body.valueWei != null && String(body.valueWei).trim() !== "") {
        try {
            return BigInt(String(body.valueWei).trim());
        } catch {
            throw Object.assign(new Error("Invalid valueWei"), { statusCode: 400 });
        }
    }
    if (body.valueEth != null && String(body.valueEth).trim() !== "") {
        try {
            return ethers.parseEther(String(body.valueEth).trim());
        } catch {
            throw Object.assign(new Error("Invalid valueEth"), { statusCode: 400 });
        }
    }
    if (body.value != null && String(body.value).trim() !== "") {
        const v = String(body.value).trim();
        try {
            if (v.startsWith("0x") || /^\d+$/.test(v)) return BigInt(v);
            return ethers.parseEther(v);
        } catch {
            throw Object.assign(new Error("Invalid value"), { statusCode: 400 });
        }
    }
    return 0n;
}

function parseCalldata(data) {
    let raw = String(data || "0x").trim();
    if (!raw) raw = "0x";
    if (!raw.startsWith("0x")) raw = "0x" + raw;
    if (raw !== "0x" && !/^0x[0-9a-fA-F]*$/.test(raw)) {
        throw Object.assign(new Error("Invalid calldata (data must be hex)"), { statusCode: 400 });
    }
    if (raw.length % 2 !== 0) {
        throw Object.assign(new Error("Invalid calldata (odd hex length)"), { statusCode: 400 });
    }
    const selector = raw.length >= 10 ? raw.slice(0, 10).toLowerCase() : null;
    return { data: raw.toLowerCase(), selector: selector === "0x" ? null : selector };
}

function buildAttackerIndex(registry) {
    const map = new Map(); // address -> [{contract, chainId, ...}]
    for (const c of registry.contracts || []) {
        for (const a of c.uniqueAttackers || []) {
            const na = normalizeAddress(a);
            if (!na) continue;
            if (!map.has(na)) map.set(na, []);
            map.get(na).push({
                contractAddress: c.contractAddress,
                chainId: c.chainId,
                network: c.network,
                riskLevel: c.riskLevel,
                riskScore: c.riskScore
            });
        }
        for (const e of c.exploits || []) {
            for (const a of e.attackerAddresses || []) {
                const na = normalizeAddress(a);
                if (!na) continue;
                if (!map.has(na)) map.set(na, []);
                map.get(na).push({
                    contractAddress: c.contractAddress,
                    chainId: c.chainId,
                    network: c.network,
                    riskLevel: c.riskLevel,
                    riskScore: c.riskScore,
                    viaTx: e.txHash
                });
            }
        }
    }
    return map;
}

function buildSelectorIndex(registry, chainId) {
    const map = new Map(); // selector -> [{contract, reentrancyCount, ...}]
    for (const c of registry.contracts || []) {
        if (Number(c.chainId) !== Number(chainId)) continue;
        for (const e of c.exploits || []) {
            const sel = (e.functionSelector || "").toLowerCase();
            if (!sel || sel.length < 10) continue;
            if (!map.has(sel)) map.set(sel, []);
            map.get(sel).push({
                contractAddress: c.contractAddress,
                riskLevel: c.riskLevel,
                riskScore: c.riskScore,
                reentrancyCount: e.reentrancyCount,
                txHash: e.txHash,
                stolenEth: e.stolenEth
            });
        }
    }
    return map;
}

async function toolOnChainDraft(network, to) {
    const out = {
        tool: "on_chain_draft",
        ok: false,
        ethBalance: null,
        hasCode: null,
        codeBytes: null,
        error: null
    };
    try {
        const { resolveProvider } = require("./analyze.js");
        const { provider } = resolveProvider(network);
        const [bal, code] = await Promise.all([
            provider.getBalance(to),
            provider.getCode(to)
        ]);
        out.ok = true;
        out.ethBalance = ethers.formatEther(bal);
        out.hasCode = Boolean(code && code !== "0x");
        out.codeBytes = code && code !== "0x" ? Math.max(0, (code.length - 2) / 2) : 0;
    } catch (err) {
        out.error = err.message || String(err);
    }
    return out;
}

function levelFromScore(score) {
    if (score >= 75) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
}

function recommendationFor(level, ledgerHit) {
    if (level === "CRITICAL" || (level === "HIGH" && ledgerHit)) return "ABORT";
    if (level === "HIGH" || level === "MEDIUM") return "REVIEW";
    return "ALLOW";
}

/**
 * Deterministic pre-tx risk from ledger + draft fields + optional on-chain tool.
 */
async function assessDraftTransaction(input = {}) {
    const network = String(input.network || "sepolia").toLowerCase();
    const chainId = resolveChainId(network, input.chainId);
    const to = normalizeAddress(input.to);
    if (!to) {
        throw Object.assign(new Error("Provide a valid `to` address (0x…)"), { statusCode: 400 });
    }
    const from = normalizeAddress(input.from);
    const valueWei = parseValueWei(input);
    const { data, selector } = parseCalldata(input.data);
    const valueEth = Number(ethers.formatEther(valueWei));

    const registry = loadRegistry();
    const victimHit = getVulnerableContract(to, chainId);
    const attackerIndex = buildAttackerIndex(registry);
    const selectorIndex = buildSelectorIndex(registry, chainId);
    const toAsAttacker = attackerIndex.get(to) || [];
    const fromAsAttacker = from ? attackerIndex.get(from) || [] : [];
    const selectorHits = selector ? selectorIndex.get(selector) || [] : [];
    const onChain = await toolOnChainDraft(network, to);

    const factors = [];
    let score = 0;
    let ledgerHit = false;

    if (victimHit) {
        ledgerHit = true;
        const pts = Math.min(55, Math.round((Number(victimHit.riskScore) || 0) * 0.55) + 20);
        score += pts;
        factors.push({
            id: "ledger_victim",
            label: "Destination is in vulnerable-contract ledger",
            points: pts,
            detail: `${victimHit.riskLevel} (${victimHit.riskScore}/100), ${victimHit.exploitCount} exploit(s), ${victimHit.totalStolenEth} ETH drained historically`
        });
    }

    if (toAsAttacker.length) {
        ledgerHit = true;
        const pts = 35;
        score += pts;
        factors.push({
            id: "ledger_attacker_as_to",
            label: "Destination matches a known reentrancy attacker address",
            points: pts,
            detail: `Seen draining ${toAsAttacker[0].contractAddress} (${toAsAttacker[0].riskLevel})`
        });
    }

    if (fromAsAttacker.length) {
        const pts = 15;
        score += pts;
        factors.push({
            id: "ledger_attacker_as_from",
            label: "Sender matches a known attacker address",
            points: pts,
            detail: `Associated with exploits against ${fromAsAttacker[0].contractAddress}`
        });
    }

    if (selectorHits.length) {
        ledgerHit = true;
        const pts = victimHit ? 15 : 30;
        score += pts;
        const h = selectorHits[0];
        factors.push({
            id: "known_selector",
            label: "Calldata selector seen in prior reentrancy exploits",
            points: pts,
            detail: `${selector} used against ${h.contractAddress} (reentries=${h.reentrancyCount}, stolen=${h.stolenEth} ETH)`
        });
    }

    // Value-at-risk heuristics
    if (valueEth >= 10) {
        const pts = 15;
        score += pts;
        factors.push({
            id: "high_value",
            label: "High ETH value attached",
            points: pts,
            detail: `${ethers.formatEther(valueWei)} ETH`
        });
    } else if (valueEth >= 1) {
        const pts = 8;
        score += pts;
        factors.push({
            id: "moderate_value",
            label: "Non-trivial ETH value attached",
            points: pts,
            detail: `${ethers.formatEther(valueWei)} ETH`
        });
    } else if (valueEth > 0) {
        const pts = 3;
        score += pts;
        factors.push({
            id: "small_value",
            label: "ETH value attached",
            points: pts,
            detail: `${ethers.formatEther(valueWei)} ETH`
        });
    }

    if (onChain.ok && onChain.hasCode === false && data !== "0x") {
        const pts = 10;
        score += pts;
        factors.push({
            id: "calldata_to_eoa",
            label: "Calldata sent to an EOA (unusual)",
            points: pts,
            detail: "Destination has no contract code on-chain"
        });
    }

    if (onChain.ok && onChain.hasCode && valueEth > 0 && !victimHit) {
        const pts = 5;
        score += pts;
        factors.push({
            id: "value_to_unknown_contract",
            label: "Sending value to a contract not in the ledger",
            points: pts,
            detail: `Contract code ~${onChain.codeBytes} bytes; not previously flagged`
        });
    }

    if (!victimHit && !toAsAttacker.length && !selectorHits.length && valueEth === 0 && data === "0x") {
        factors.push({
            id: "empty_transfer_shape",
            label: "Simple zero-value call with empty data",
            points: 0,
            detail: "No ledger hit; residual risk depends on off-ledger context"
        });
    }

    score = Math.min(100, score);
    const riskLevel = levelFromScore(score);
    const recommendation = recommendationFor(riskLevel, ledgerHit);

    const assessment = {
        id: `txr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        network,
        chainId,
        draft: {
            from,
            to,
            valueWei: valueWei.toString(),
            valueEth: ethers.formatEther(valueWei),
            data,
            selector
        },
        riskScore: score,
        riskLevel,
        recommendation,
        ledgerHit,
        summary:
            recommendation === "ABORT"
                ? "High confidence this draft interacts with known reentrancy risk — abort unless you fully understand the exposure."
                : recommendation === "REVIEW"
                  ? "Elevated risk signals — review carefully with a human before broadcasting."
                  : "No strong ledger match — residual risk remains; human should still confirm intent.",
        riskFactors: factors,
        ledger: {
            victimContract: victimHit
                ? {
                      contractAddress: victimHit.contractAddress,
                      riskScore: victimHit.riskScore,
                      riskLevel: victimHit.riskLevel,
                      exploitCount: victimHit.exploitCount,
                      totalStolenEth: victimHit.totalStolenEth,
                      maxReentrancyCount: victimHit.maxReentrancyCount,
                      riskSummary: victimHit.riskSummary
                  }
                : null,
            toAsAttackerHits: toAsAttacker.slice(0, 5),
            fromAsAttackerHits: fromAsAttacker.slice(0, 5),
            selectorHits: selectorHits.slice(0, 5)
        },
        onChain,
        humanDecision: null,
        aiBriefing: null
    };

    const store = loadStore();
    store.assessments.unshift(assessment);
    store.assessments = store.assessments.slice(0, 200);
    saveStore(store);

    return assessment;
}

async function attachAiBriefing(assessment, { force = false } = {}) {
    if (!aiEnabled()) {
        return { assessment, skipped: true, reason: "AI disabled" };
    }
    if (assessment.aiBriefing && !force) {
        return { assessment, skipped: true, reason: "cached" };
    }

    const timeoutMs = Number(process.env.RISK_AI_TIMEOUT_MS || 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const { generatePreTxAiBriefing } = require("./txRiskAgent.js");
        const ai = await generatePreTxAiBriefing(assessment, controller.signal);
        assessment.aiBriefing = ai;

        const store = loadStore();
        const idx = store.assessments.findIndex(a => a.id === assessment.id);
        if (idx >= 0) {
            store.assessments[idx] = assessment;
            saveStore(store);
        }
        return { assessment, skipped: false };
    } finally {
        clearTimeout(timer);
    }
}

function recordHumanDecision(assessmentId, decision, note = "") {
    const d = String(decision || "").toUpperCase();
    if (d !== "CONTINUE" && d !== "ABORT") {
        throw Object.assign(new Error('decision must be "CONTINUE" or "ABORT"'), { statusCode: 400 });
    }
    const store = loadStore();
    const assessment = store.assessments.find(a => a.id === assessmentId);
    if (!assessment) {
        throw Object.assign(new Error("Assessment not found"), { statusCode: 404 });
    }

    const record = {
        assessmentId,
        decision: d,
        note: String(note || "").slice(0, 500),
        decidedAt: new Date().toISOString(),
        riskScoreAtDecision: assessment.riskScore,
        riskLevelAtDecision: assessment.riskLevel,
        recommendationAtDecision: assessment.recommendation,
        to: assessment.draft && assessment.draft.to,
        network: assessment.network
    };

    assessment.humanDecision = record;
    store.decisions.unshift(record);
    store.decisions = store.decisions.slice(0, 500);
    saveStore(store);

    return { assessment, decision: record };
}

function getAssessment(id) {
    const store = loadStore();
    return store.assessments.find(a => a.id === id) || null;
}

module.exports = {
    DECISIONS_PATH,
    assessDraftTransaction,
    attachAiBriefing,
    recordHumanDecision,
    getAssessment,
    loadStore
};
