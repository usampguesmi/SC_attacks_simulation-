const { ethers } = require("ethers");
const {
    detectReentrancyFromContent,
    formatReport
} = require("../database/scripts/reentrancyDetector.js");
const { fetchFormat2ViaProvider } = require("./traceFormat2.js");

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const NETWORKS = {
    sepolia: { chainId: 11155111, label: "sepolia" },
    mainnet: { chainId: 1, label: "mainnet" }
};

/** @type {Record<string, { provider: any, label: string }>} */
const rpcProviders = {};

function setRpcProvider(provider, label = "hardhat", network = "sepolia") {
    const key = normalizeNetwork(network);
    rpcProviders[key] = { provider, label };
}

function setRpcProviders(map) {
    for (const [network, value] of Object.entries(map || {})) {
        if (!value || !value.provider) continue;
        setRpcProvider(value.provider, value.label || network, network);
    }
}

function normalizeNetwork(network) {
    const n = String(network || "sepolia").toLowerCase().trim();
    if (n === "eth" || n === "ethereum" || n === "main" || n === "1") return "mainnet";
    if (n === "sep" || n === "11155111") return "sepolia";
    if (NETWORKS[n]) return n;
    const err = new Error(`Unsupported network "${network}". Use "sepolia" or "mainnet".`);
    err.statusCode = 400;
    throw err;
}

function pickRpcUrl(network) {
    const key = normalizeNetwork(network);
    if (key === "mainnet") {
        return (
            process.env.MAINNET_RPC_URL ||
            process.env.ETH_MAINNET_RPC_URL ||
            process.env.MAINNET_RPC_URL_PREMIUM ||
            process.env.MAINNET_RPC_URL_FREE ||
            null
        );
    }
    return (
        process.env.SEPOLIA_RPC_URL_PREIMUM ||
        process.env.SEPOLIA_RPC_URL_PREMIUM ||
        process.env.SEPOLIA_RPC_URL_FREE ||
        process.env.RPC_URL ||
        null
    );
}

function listConfiguredNetworks() {
    const available = new Set(Object.keys(rpcProviders));
    for (const name of Object.keys(NETWORKS)) {
        if (pickRpcUrl(name)) available.add(name);
    }
    return [...available];
}

function resolveProvider(network = "sepolia") {
    const key = normalizeNetwork(network);
    if (rpcProviders[key]) {
        return { ...rpcProviders[key], network: key };
    }

    const rpcUrl = pickRpcUrl(key);
    if (!rpcUrl) {
        const err = new Error(
            key === "mainnet"
                ? "No mainnet RPC configured. Set MAINNET_RPC_URL in .env (Alchemy: https://eth-mainnet.g.alchemy.com/v2/<key>), then restart npm run analyze-ui."
                : "No Sepolia RPC configured. Set SEPOLIA_RPC_URL_PREIMUM in .env, then restart npm run analyze-ui."
        );
        err.statusCode = 502;
        throw err;
    }

    let host;
    try {
        host = new URL(rpcUrl).hostname;
    } catch {
        host = "rpc";
    }

    const chainId = NETWORKS[key].chainId;
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        staticNetwork: ethers.Network.from(chainId)
    });
    return { provider, label: `${key}:${host}`, network: key };
}

async function format2FromDatabase(txHash) {
    let pool;
    try {
        pool = require("../database/db.js");
    } catch {
        return null;
    }
    try {
        const result = await pool.query(
            `SELECT tx_hash, opcode_stack_traces, block_number, tx_status, from_address, to_address, chain_id
             FROM main_transaction
             WHERE LOWER(tx_hash) = LOWER($1)
             LIMIT 1`,
            [txHash]
        );
        const row = result.rows[0];
        if (!row || !row.opcode_stack_traces) return null;
        return {
            format2: row.opcode_stack_traces,
            source: "database",
            meta: {
                txHash: row.tx_hash,
                blockNumber: row.block_number,
                status: row.tx_status,
                from: row.from_address,
                to: row.to_address,
                chainId: row.chain_id
            }
        };
    } catch (err) {
        console.warn("[analyze] database lookup skipped:", err.message);
        return null;
    }
}

async function format2FromRpc(txHash, network = "sepolia") {
    const { provider, label, network: net } = resolveProvider(network);
    try {
        const fetched = await fetchFormat2ViaProvider(provider, txHash);
        return {
            ...fetched,
            source: `rpc:${net}`,
            meta: { ...fetched.meta, network: net }
        };
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
            const wrapped = new Error(
                `Cannot reach RPC (${label}): DNS/network failure. ` +
                `Hash was not in Postgres. Start the UI with \`npm run analyze-ui\` in your own terminal.`
            );
            wrapped.statusCode = 502;
            throw wrapped;
        }
        const wrapped = new Error(`RPC trace fetch failed via ${label}: ${msg}`);
        wrapped.statusCode = 502;
        throw wrapped;
    }
}

async function analyzeTransaction(txHash, options = {}) {
    if (!TX_HASH_RE.test(txHash)) {
        const err = new Error("Invalid transaction hash. Expected 0x followed by 64 hex characters.");
        err.statusCode = 400;
        throw err;
    }

    const network = normalizeNetwork(options.network || "sepolia");

    let fetched = await format2FromDatabase(txHash);
    if (!fetched) {
        try {
            fetched = await format2FromRpc(txHash, network);
        } catch (err) {
            if (!err.statusCode) err.statusCode = 502;
            if (err.message && !/not in Postgres/i.test(err.message)) {
                err.message =
                    `No format2 trace in Postgres for this hash. Tried ${network} RPC instead — ${err.message}`;
            }
            throw err;
        }
    }

    const result = finalize(txHash, fetched);
    result.network = fetched.source === "database"
        ? (fetched.meta && fetched.meta.chainId === 1 ? "mainnet" : network)
        : network;
    return result;
}

function analyzeFromFormat2(format2, label = "pasted-format2") {
    const text = String(format2 || "").trim();
    if (!text || !text.includes(";")) {
        const err = new Error("format2 trace is empty or invalid (expected lines like pc;OP;stack...)");
        err.statusCode = 400;
        throw err;
    }
    return finalize(label, {
        format2: text,
        source: "paste",
        opcodeCount: text.split("\n").filter(Boolean).length,
        meta: { txHash: label }
    });
}

function finalize(txHash, fetched) {
    const detection = detectReentrancyFromContent(fetched.format2);
    const report = formatReport(detection, txHash);

    return {
        txHash,
        traceSource: fetched.source,
        opcodeCount: fetched.opcodeCount ?? fetched.format2.split("\n").filter(Boolean).length,
        meta: fetched.meta,
        detection,
        report
    };
}

function pickField(row, ...keys) {
    for (const key of keys) {
        if (row[key] != null && row[key] !== "") return row[key];
    }
    return null;
}

function normalizeDataset(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
        for (const key of ["transactions", "rows", "data", "main_transaction", "main_transactions"]) {
            if (Array.isArray(payload[key])) return payload[key];
        }
    }
    const err = new Error(
        "Dataset must be a JSON array of main_transaction objects, " +
        "or an object with a transactions/rows/data array."
    );
    err.statusCode = 400;
    throw err;
}

function analyzeMainTransactionRow(row, index = 0) {
    if (!row || typeof row !== "object") {
        return {
            index,
            txHash: `row-${index}`,
            detection: { verdict: "ERROR", reason: "row is not an object" },
            report: null,
            meta: {}
        };
    }

    const txHash = pickField(row, "tx_hash", "txHash") || `row-${index}`;
    const format2 = pickField(row, "opcode_stack_traces", "opcodeStackTraces");
    const meta = {
        txHash,
        txId: pickField(row, "tx_id", "txId"),
        functionName: pickField(row, "function_name", "functionName"),
        transactionPurpose: pickField(row, "transaction_purpose", "transactionPurpose"),
        from: pickField(row, "from_address", "fromAddress"),
        to: pickField(row, "to_address", "toAddress"),
        blockNumber: pickField(row, "block_number", "blockNumber"),
        txTimestamp: pickField(row, "tx_timestamp", "txTimestamp"),
        chainId: pickField(row, "chain_id", "chainId")
    };

    if (!format2 || typeof format2 !== "string" || !format2.includes(";")) {
        return {
            index,
            txHash,
            traceSource: "dataset",
            meta,
            detection: {
                verdict: "NO_TRACE",
                reason: "opcode_stack_traces missing or empty on this row"
            },
            report: null
        };
    }

    try {
        const result = finalize(txHash, {
            format2,
            source: "dataset",
            opcodeCount: format2.split("\n").filter(Boolean).length,
            meta
        });
        return { index, ...result };
    } catch (err) {
        return {
            index,
            txHash,
            traceSource: "dataset",
            meta,
            detection: { verdict: "ERROR", reason: err.message || String(err) },
            report: null
        };
    }
}

function analyzeDataset(payload, options = {}) {
    const rows = normalizeDataset(payload);
    if (rows.length === 0) {
        const err = new Error("Dataset is empty");
        err.statusCode = 400;
        throw err;
    }

    const offset = Math.max(0, Number(options.offset) || 0);
    const limit =
        options.limit != null && Number.isFinite(Number(options.limit))
            ? Math.max(1, Number(options.limit))
            : rows.length;
    const slice = rows.slice(offset, offset + limit);
    const truncated = offset + slice.length < rows.length;

    const results = slice.map((row, i) => {
        const r = analyzeMainTransactionRow(row, offset + i);
        // Keep API responses small — drop verbose report text for dataset mode
        if (r && r.report) delete r.report;
        return r;
    });
    const byVerdict = {};
    const flagged = [];
    for (const r of results) {
        const v = r.detection.verdict;
        byVerdict[v] = (byVerdict[v] || 0) + 1;
        if (v === "REENTRANCY_DETECTED") {
            flagged.push({
                index: r.index,
                txHash: r.txHash,
                functionName: r.meta && r.meta.functionName,
                reentrancyCount: r.detection.reentrancyCount,
                victimContract: r.detection.victimContract,
                totalDrainedEth: r.detection.totalDrainedEth
            });
        }
    }

    return {
        summary: {
            total: results.length,
            datasetTotal: rows.length,
            offset,
            limit,
            truncated,
            byVerdict,
            flaggedCount: flagged.length
        },
        flagged,
        results
    };
}

module.exports = {
    analyzeTransaction,
    analyzeFromFormat2,
    analyzeMainTransactionRow,
    analyzeDataset,
    normalizeDataset,
    setRpcProvider,
    setRpcProviders,
    resolveProvider,
    listConfiguredNetworks,
    normalizeNetwork,
    NETWORKS,
    TX_HASH_RE,
    pickRpcUrl
};
