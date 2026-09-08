/**
 * Automated risk-registry agent.
 *
 * After REENTRANCY_DETECTED, records the victim contract + exploit facts into a
 * local JSON dataset (and optionally Postgres), then recomputes a risk score.
 *
 * Scoring is deterministic (fast, auditable). Optional AI narrative runs in the
 * background only when a new exploit is recorded and an API key is configured.
 *
 * Dataset file: data/vulnerable_contract_registry.json
 */
const fs = require("fs");
const path = require("path");
const { aiEnabled, enrichContractWithAi } = require("./riskAgent.js");

const DATA_DIR = process.env.YU_SAM_DATA_DIR
    ? path.resolve(process.env.YU_SAM_DATA_DIR)
    : path.join(__dirname, "../data");
const REGISTRY_PATH = path.join(DATA_DIR, "vulnerable_contract_registry.json");

/** In-flight AI jobs keyed by chainId:address — avoid duplicate LLM calls. */
const aiJobs = new Map();

const NETWORK_CHAIN_ID = {
    mainnet: 1,
    ethereum: 1,
    sepolia: 11155111
};

function emptyRegistry() {
    return { version: 1, updatedAt: null, contracts: [] };
}

function ensureStore() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(REGISTRY_PATH)) {
        fs.writeFileSync(REGISTRY_PATH, JSON.stringify(emptyRegistry(), null, 2));
    }
}

function loadRegistry() {
    ensureStore();
    try {
        const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.contracts)) return emptyRegistry();
        return data;
    } catch {
        return emptyRegistry();
    }
}

function saveRegistry(registry) {
    ensureStore();
    registry.updatedAt = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function normalizeAddress(addr) {
    if (!addr || typeof addr !== "string") return null;
    const a = addr.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
    return a;
}

function resolveChainId(network, chainId) {
    if (chainId != null && Number.isFinite(Number(chainId))) return Number(chainId);
    const key = String(network || "sepolia").toLowerCase();
    return NETWORK_CHAIN_ID[key] || NETWORK_CHAIN_ID.sepolia;
}

function weiToEthString(wei) {
    if (wei === null || wei === undefined) return "0";
    try {
        const v = typeof wei === "bigint" ? wei : BigInt(wei);
        const whole = v / 1000000000000000000n;
        const frac = (v % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
        return frac ? `${whole}.${frac}` : `${whole}`;
    } catch {
        return "0";
    }
}

function ethNumber(wei) {
    try {
        const v = typeof wei === "bigint" ? wei : BigInt(wei || 0);
        return Number(v) / 1e18;
    } catch {
        return 0;
    }
}

/**
 * Risk score 0–100 from aggregated exploit history.
 * Factors: volume stolen, exploit count, max reentry depth, unique attackers, mainnet, recency.
 */
function computeRiskAssessment(contract) {
    const totalEth = ethNumber(contract.totalStolenWei || 0);
    const exploitCount = contract.exploitCount || (contract.exploits && contract.exploits.length) || 0;
    const maxRe = contract.maxReentrancyCount || 0;
    const attackers = (contract.uniqueAttackers || []).length;
    const isMainnet = Number(contract.chainId) === 1 || contract.network === "mainnet";

    let lastTs = contract.lastDetectedAt ? Date.parse(contract.lastDetectedAt) : 0;
    const ageDays = lastTs ? (Date.now() - lastTs) / (86400000) : 9999;

    const factors = [];

    // Stolen volume (log scale) — up to 40
    const volumeScore = Math.min(40, Math.round(Math.log10(1 + totalEth) * 12));
    factors.push({
        id: "stolen_volume",
        label: "Total value drained",
        points: volumeScore,
        detail: `${weiToEthString(contract.totalStolenWei)} ETH across known exploits`
    });

    // Number of distinct exploit txs — up to 25
    const exploitScore = Math.min(25, exploitCount * 5);
    factors.push({
        id: "exploit_count",
        label: "Confirmed exploit transactions",
        points: exploitScore,
        detail: `${exploitCount} recorded exploit(s)`
    });

    // Deepest single-tx reentry — up to 15
    const depthScore = Math.min(15, Math.round(Math.log2(1 + maxRe) * 4));
    factors.push({
        id: "reentrancy_depth",
        label: "Max reentries in one tx",
        points: depthScore,
        detail: `max reentrancyCount = ${maxRe}`
    });

    // Distinct attackers — up to 10
    const attackerScore = Math.min(10, attackers * 3);
    factors.push({
        id: "attackers",
        label: "Distinct attacker addresses",
        points: attackerScore,
        detail: `${attackers} unique recipient/attacker address(es)`
    });

    // Mainnet premium — 5
    const networkScore = isMainnet ? 5 : 0;
    factors.push({
        id: "network",
        label: "Network exposure",
        points: networkScore,
        detail: isMainnet ? "mainnet" : (contract.network || "testnet")
    });

    // Recency — up to 5
    let recencyScore = 0;
    if (ageDays <= 30) recencyScore = 5;
    else if (ageDays <= 180) recencyScore = 3;
    else if (ageDays <= 365) recencyScore = 1;
    factors.push({
        id: "recency",
        label: "Recency of last exploit",
        points: recencyScore,
        detail: lastTs ? `last exploit ${Math.round(ageDays)} day(s) ago` : "unknown"
    });

    const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
    let level = "LOW";
    if (score >= 75) level = "CRITICAL";
    else if (score >= 50) level = "HIGH";
    else if (score >= 25) level = "MEDIUM";

    return {
        riskScore: score,
        riskLevel: level,
        riskFactors: factors,
        summary:
            level === "CRITICAL"
                ? "Critical: repeated high-value reentrancy exploitation on a production network."
                : level === "HIGH"
                  ? "High: material value stolen and/or multiple confirmed reentrancy exploits."
                  : level === "MEDIUM"
                    ? "Medium: confirmed reentrancy with limited observed impact so far."
                    : "Low: limited observed drain or testnet-only activity."
    };
}

function findContract(registry, address, chainId) {
    const addr = normalizeAddress(address);
    return registry.contracts.find(
        c => c.contractAddress === addr && Number(c.chainId) === Number(chainId)
    );
}

function buildExploitRecord(detection, context = {}) {
    const d = detection.detection || detection;
    const meta = detection.meta || {};
    const network = context.network || detection.network || meta.network || "sepolia";
    const chainId = resolveChainId(network, context.chainId || meta.chainId);
    const txHash = (context.txHash || detection.txHash || meta.txHash || "").toLowerCase();
    const stolenWei = d.totalDrainedWei != null ? String(d.totalDrainedWei) : "0";
    const attackers = [];
    const a = normalizeAddress(d.attackerAddress);
    if (a) attackers.push(a);

    return {
        txHash,
        network,
        chainId,
        attackName: context.attackName || "sf_reentrancy",
        blockNumber: meta.blockNumber != null ? Number(meta.blockNumber) : (context.blockNumber ?? null),
        timestamp: meta.txTimestamp || context.timestamp || null,
        stolenWei,
        stolenEth: weiToEthString(stolenWei),
        reentrancyCount: d.reentrancyCount ?? 0,
        functionSelector: d.functionSelector || null,
        attackerAddresses: attackers,
        valuePerCallWei: d.valuePerCallWei != null ? String(d.valuePerCallWei) : null,
        valuePerCallEth: d.valuePerCallEth || null,
        victimContract: normalizeAddress(d.victimContract),
        detectedAt: new Date().toISOString()
    };
}

/**
 * Record a positive detection into the registry. Idempotent on (chainId, txHash).
 * Returns { recorded, updated, contract } or { skipped, reason }.
 */
function recordDetection(analysisResult, context = {}) {
    const d = (analysisResult && analysisResult.detection) || analysisResult;
    if (!d || d.verdict !== "REENTRANCY_DETECTED") {
        return { skipped: true, reason: "verdict is not REENTRANCY_DETECTED" };
    }
    const victim = normalizeAddress(d.victimContract);
    if (!victim) {
        return { skipped: true, reason: "missing victimContract" };
    }

    const wrapped = analysisResult.detection
        ? analysisResult
        : { ...analysisResult, detection: d, txHash: context.txHash || analysisResult.txHash, meta: analysisResult.meta || {} };

    const exploit = buildExploitRecord(wrapped, context);
    if (!exploit.txHash || !/^0x[0-9a-f]{64}$/.test(exploit.txHash)) {
        // still allow paste mode with synthetic label? require real hash for registry
        if (!exploit.txHash.startsWith("0x") || exploit.txHash.length < 10) {
            return { skipped: true, reason: "missing tx hash for exploit record" };
        }
    }

    const registry = loadRegistry();
    let contract = findContract(registry, victim, exploit.chainId);
    let updated = false;
    let recorded = false;

    if (!contract) {
        contract = {
            contractAddress: victim,
            chainId: exploit.chainId,
            network: exploit.network,
            attackName: exploit.attackName,
            firstDetectedAt: exploit.detectedAt,
            lastDetectedAt: exploit.detectedAt,
            totalStolenWei: "0",
            totalStolenEth: "0",
            exploitCount: 0,
            maxReentrancyCount: 0,
            uniqueAttackers: [],
            riskScore: 0,
            riskLevel: "LOW",
            riskFactors: [],
            riskSummary: "",
            exploits: []
        };
        registry.contracts.push(contract);
        recorded = true;
    }

    const dup = contract.exploits.find(
        e => e.txHash === exploit.txHash && Number(e.chainId) === Number(exploit.chainId)
    );
    if (dup) {
        const assessment = computeRiskAssessment(contract);
        Object.assign(contract, assessment);
        saveRegistry(registry);
        return { recorded: false, updated: false, duplicate: true, contract: enrichContract(contract) };
    }

    contract.exploits.push(exploit);
    contract.exploitCount = contract.exploits.length;
    contract.lastDetectedAt = exploit.detectedAt;
    if (!contract.firstDetectedAt) contract.firstDetectedAt = exploit.detectedAt;
    contract.network = exploit.network || contract.network;
    contract.attackName = exploit.attackName || contract.attackName;

    let total = 0n;
    let maxRe = 0;
    const attackers = new Set(contract.uniqueAttackers || []);
    for (const e of contract.exploits) {
        try {
            total += BigInt(e.stolenWei || 0);
        } catch { /* ignore */ }
        maxRe = Math.max(maxRe, Number(e.reentrancyCount) || 0);
        for (const a of e.attackerAddresses || []) {
            const na = normalizeAddress(a);
            if (na) attackers.add(na);
        }
    }
    contract.totalStolenWei = total.toString();
    contract.totalStolenEth = weiToEthString(total);
    contract.maxReentrancyCount = maxRe;
    contract.uniqueAttackers = [...attackers];

    const assessment = computeRiskAssessment(contract);
    contract.riskScore = assessment.riskScore;
    contract.riskLevel = assessment.riskLevel;
    contract.riskFactors = assessment.riskFactors;
    contract.riskSummary = assessment.summary;

    updated = true;
    saveRegistry(registry);

    // Best-effort Postgres mirror (non-fatal)
    syncPostgres(contract, exploit).catch(err => {
        console.warn("[riskRegistry] postgres sync skipped:", err.message);
    });

    // AI narrative: background only on new exploits (cached by fingerprint)
    scheduleAiEnrichment(contract.contractAddress, contract.chainId);

    return {
        recorded: recorded || updated,
        updated,
        contract: enrichContract(contract),
        aiPending: aiEnabled()
    };
}

function aiJobKey(address, chainId) {
    return `${Number(chainId)}:${normalizeAddress(address)}`;
}

/**
 * Fire-and-forget AI briefing. Dedupes concurrent jobs; skips when cached.
 * Keeps analyze/detect path fast — score is already persisted.
 */
function scheduleAiEnrichment(address, chainId) {
    if (!aiEnabled()) return;
    if (String(process.env.PUBLIC_MODE || "").toLowerCase() === "true" &&
        String(process.env.PUBLIC_AI || "").toLowerCase() !== "true") {
        return;
    }
    const key = aiJobKey(address, chainId);
    if (!key.includes("0x") || aiJobs.has(key)) return;

    const job = (async () => {
        try {
            const registry = loadRegistry();
            const contract = findContract(registry, address, chainId);
            if (!contract) return;
            const { skipped, reason } = await enrichContractWithAi(contract);
            if (!skipped) {
                saveRegistry(registry);
                console.log(
                    `[riskAgent] AI briefing saved for ${contract.contractAddress} (chain ${contract.chainId})`
                );
            } else if (reason && reason !== "cached") {
                console.warn(`[riskAgent] skipped: ${reason}`);
            }
        } catch (err) {
            console.warn("[riskAgent]", err.message || err);
        } finally {
            aiJobs.delete(key);
        }
    })();

    aiJobs.set(key, job);
}

/**
 * On-demand AI assess (awaits). Used by UI "Run AI briefing" button.
 */
async function assessContractWithAi(address, chainId, { force = true } = {}) {
    if (!aiEnabled()) {
        return {
            ok: false,
            reason:
                "AI disabled — add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env, then restart analyze-ui"
        };
    }
    const registry = loadRegistry();
    const cid = resolveChainId(null, chainId);
    const contract = findContract(registry, address, cid);
    if (!contract) return { ok: false, reason: "Contract not in registry" };

    try {
        const { ai, skipped, reason } = await enrichContractWithAi(contract, { force });
        if (!skipped) saveRegistry(registry);
        return {
            ok: true,
            skipped: Boolean(skipped),
            reason: reason || null,
            contract: enrichContract(contract),
            aiAssessment: ai || contract.aiAssessment || null
        };
    } catch (err) {
        return { ok: false, reason: err.message || String(err), contract: enrichContract(contract) };
    }
}

function getAiStatus() {
    return {
        enabled: aiEnabled(),
        pendingJobs: aiJobs.size,
        hint: aiEnabled()
            ? "AI risk briefings run in the background after new detections (cached)."
            : "Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env (optional RISK_AI_ENABLED=false to disable)."
    };
}

function enrichContract(contract) {
    return {
        ...contract,
        totalStolenEth: contract.totalStolenEth || weiToEthString(contract.totalStolenWei),
        uniqueAttackerCount: (contract.uniqueAttackers || []).length
    };
}

function listVulnerableContracts({ sortBy = "riskScore" } = {}) {
    const registry = loadRegistry();
    const list = registry.contracts.map(enrichContract);
    list.sort((a, b) => {
        if (sortBy === "stolen") {
            try {
                return BigInt(b.totalStolenWei || 0) > BigInt(a.totalStolenWei || 0) ? 1 : -1;
            } catch {
                return (b.riskScore || 0) - (a.riskScore || 0);
            }
        }
        if (sortBy === "recent") {
            return String(b.lastDetectedAt || "").localeCompare(String(a.lastDetectedAt || ""));
        }
        return (b.riskScore || 0) - (a.riskScore || 0);
    });
    return {
        updatedAt: registry.updatedAt,
        count: list.length,
        contracts: list
    };
}

function getVulnerableContract(address, chainId) {
    const registry = loadRegistry();
    const cid = resolveChainId(null, chainId);
    const contract = findContract(registry, address, cid);
    return contract ? enrichContract(contract) : null;
}

let schemaReady = null;

async function ensurePostgresSchema(pool) {
    if (schemaReady) return schemaReady;
    schemaReady = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vulnerable_contract (
                contract_address   VARCHAR(50) NOT NULL,
                chain_id           BIGINT NOT NULL,
                network_name       VARCHAR(50),
                attack_name        VARCHAR(100) NOT NULL DEFAULT 'sf_reentrancy',
                first_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                total_stolen_wei   NUMERIC(78, 0) NOT NULL DEFAULT 0,
                exploit_count      INT NOT NULL DEFAULT 0,
                max_reentrancy_count INT NOT NULL DEFAULT 0,
                unique_attacker_count INT NOT NULL DEFAULT 0,
                risk_score         INT NOT NULL DEFAULT 0,
                risk_level         VARCHAR(20) NOT NULL DEFAULT 'LOW',
                risk_factors       JSONB NOT NULL DEFAULT '[]'::jsonb,
                PRIMARY KEY (contract_address, chain_id)
            );
            CREATE TABLE IF NOT EXISTS contract_exploit (
                exploit_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                contract_address   VARCHAR(50) NOT NULL,
                chain_id           BIGINT NOT NULL,
                tx_hash            VARCHAR(70) NOT NULL,
                network_name       VARCHAR(50),
                attack_name        VARCHAR(100) NOT NULL DEFAULT 'sf_reentrancy',
                block_number       BIGINT,
                tx_timestamp       TIMESTAMPTZ,
                stolen_wei         NUMERIC(78, 0) NOT NULL DEFAULT 0,
                reentrancy_count   INT,
                function_selector  VARCHAR(20),
                attacker_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
                value_per_call_wei NUMERIC(78, 0),
                detection_detail   JSONB,
                detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_contract_exploit_tx UNIQUE (chain_id, tx_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_vulnerable_contract_risk
                ON vulnerable_contract (risk_score DESC);
            CREATE INDEX IF NOT EXISTS idx_contract_exploit_contract
                ON contract_exploit (contract_address, chain_id, detected_at DESC);
        `);
    })().catch(err => {
        schemaReady = null;
        throw err;
    });
    return schemaReady;
}

async function syncPostgres(contract, exploit) {
    let pool;
    try {
        pool = require("../database/db.js");
    } catch {
        return;
    }
    await ensurePostgresSchema(pool);

    await pool.query(
        `INSERT INTO vulnerable_contract (
            contract_address, chain_id, network_name, attack_name,
            first_detected_at, last_detected_at, total_stolen_wei,
            exploit_count, max_reentrancy_count, unique_attacker_count,
            risk_score, risk_level, risk_factors
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (contract_address, chain_id) DO UPDATE SET
            network_name = EXCLUDED.network_name,
            attack_name = EXCLUDED.attack_name,
            last_detected_at = EXCLUDED.last_detected_at,
            total_stolen_wei = EXCLUDED.total_stolen_wei,
            exploit_count = EXCLUDED.exploit_count,
            max_reentrancy_count = EXCLUDED.max_reentrancy_count,
            unique_attacker_count = EXCLUDED.unique_attacker_count,
            risk_score = EXCLUDED.risk_score,
            risk_level = EXCLUDED.risk_level,
            risk_factors = EXCLUDED.risk_factors`,
        [
            contract.contractAddress,
            contract.chainId,
            contract.network,
            contract.attackName,
            contract.firstDetectedAt,
            contract.lastDetectedAt,
            contract.totalStolenWei,
            contract.exploitCount,
            contract.maxReentrancyCount,
            (contract.uniqueAttackers || []).length,
            contract.riskScore,
            contract.riskLevel,
            JSON.stringify(contract.riskFactors || [])
        ]
    );

    await pool.query(
        `INSERT INTO contract_exploit (
            contract_address, chain_id, tx_hash, network_name, attack_name,
            block_number, tx_timestamp, stolen_wei, reentrancy_count,
            function_selector, attacker_addresses, value_per_call_wei, detected_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (chain_id, tx_hash) DO NOTHING`,
        [
            contract.contractAddress,
            exploit.chainId,
            exploit.txHash,
            exploit.network,
            exploit.attackName,
            exploit.blockNumber,
            exploit.timestamp,
            exploit.stolenWei,
            exploit.reentrancyCount,
            exploit.functionSelector,
            JSON.stringify(exploit.attackerAddresses || []),
            exploit.valuePerCallWei,
            exploit.detectedAt
        ]
    );
}

function recordFromAnalysis(analysisResult, context = {}) {
    return recordDetection(analysisResult, context);
}

module.exports = {
    REGISTRY_PATH,
    computeRiskAssessment,
    recordDetection,
    recordFromAnalysis,
    listVulnerableContracts,
    getVulnerableContract,
    assessContractWithAi,
    scheduleAiEnrichment,
    getAiStatus,
    loadRegistry,
    weiToEthString,
    resolveChainId
};
