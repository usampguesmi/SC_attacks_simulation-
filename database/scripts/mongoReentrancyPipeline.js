/**
 * Memory-safe MongoDB reentrancy scan.
 *
 * Why the old run crashed: `.find().limit(N).toArray()` loaded N full traces into RAM
 * at once, then kept every result in an array and wrote one giant JSON. Huge `tx_trace`
 * strings easily OOM a laptop.
 *
 * This version:
 *   - streams with a cursor (batchSize)
 *   - processes one document at a time
 *   - optionally skips already-analyzed tx_hash (resume)
 *   - skips oversized traces
 *   - writes results to Mongo only (JSON dump is optional)
 *   - prints progress / verdict counts
 *
 * Usage:
 *   node database/scripts/mongoReentrancyPipeline.js --limit 50
 *   node database/scripts/mongoReentrancyPipeline.js --limit 1000 --resume
 *   node database/scripts/mongoReentrancyPipeline.js --limit 5000 --max-trace-mb 8 --resume
 *   MONGO_URI=mongodb://127.0.0.1:27017 node database/scripts/mongoReentrancyPipeline.js --limit 20
 *
 * Env:
 *   MONGO_URI          default mongodb://127.0.0.1:27017
 *   MONGO_DB           default geth
 *   MONGO_COLLECTION   default transaction
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const {
    parseTraceContent,
    buildNodes,
    assignDepths,
    findRepeatedNodes,
    filterSplitCandidates,
    groupByDepth,
    composeFunctions,
    splitIntoChains
} = require("./reentrancyDetector.js");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const SOURCE_DB = process.env.MONGO_DB || "geth";
const SOURCE_COLLECTION = process.env.MONGO_COLLECTION || "transaction";
const RESULTS_COLLECTION = process.env.MONGO_RESULTS_COLLECTION || "reentrancy_detection_results";

function parseArgs(argv) {
    const out = {
        limit: 100,
        skip: 0,
        batchSize: 10,
        maxTraceMb: 16,
        resume: false,
        json: false,
        onlyWithTrace: true
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--resume") out.resume = true;
        else if (a === "--json") out.json = true;
        else if (a === "--include-empty-trace") out.onlyWithTrace = false;
        else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
        else if (a === "--skip") out.skip = parseInt(argv[++i], 10);
        else if (a === "--batch") out.batchSize = parseInt(argv[++i], 10);
        else if (a === "--max-trace-mb") out.maxTraceMb = Number(argv[++i]);
        else if (/^\d+$/.test(a)) out.limit = parseInt(a, 10); // backward compat: bare number
        else if (a === "--help" || a === "-h") out.help = true;
    }
    if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 100;
    if (!Number.isFinite(out.skip) || out.skip < 0) out.skip = 0;
    if (!Number.isFinite(out.batchSize) || out.batchSize <= 0) out.batchSize = 10;
    if (!Number.isFinite(out.maxTraceMb) || out.maxTraceMb <= 0) out.maxTraceMb = 16;
    return out;
}

function containsOp(node, opName) {
    return node.lines.some(l => l.op === opName);
}

function extractFunctionSelectorHistorical(node) {
    for (const line of node.lines) {
        if (line.op !== "CALLDATALOAD") continue;
        const word = line.args && line.args[0];
        if (!word) continue;
        try {
            const hex = BigInt(word.startsWith("0x") ? word : `0x${word}`).toString(16).padStart(64, "0");
            return `0x${hex.slice(0, 8)}`;
        } catch {
            continue;
        }
    }
    return null;
}

function traceFieldToContent(txTrace) {
    return String(txTrace).split("|").filter(Boolean).join("\n");
}

function classifyStructural(functions) {
    if (functions.length === 0) {
        return { verdict: "NOT_REENTRANT", reentrancyCount: 0, reason: "no repeated call-frame pair found", chain: [] };
    }

    for (let i = 1; i < functions.length; i++) {
        if (functions[i].p1.index <= functions[i - 1].p1.index) {
            return { verdict: "INCONCLUSIVE", reason: `p1 index not increasing with depth at rank ${i}`, chain: [] };
        }
        if (functions[i].p2.index >= functions[i - 1].p2.index) {
            return { verdict: "INCONCLUSIVE", reason: `p2 index not decreasing with depth at rank ${i}`, chain: [] };
        }
        if (functions[i].p2.startPc !== functions[i].p1.endPc + 1) {
            return { verdict: "INCONCLUSIVE", reason: `p2 does not resume right after p1's CALL at rank ${i}`, chain: [] };
        }
    }

    const baseline = functions[0];
    const sameFn = functions.every(f => f.p1.signature === baseline.p1.signature);
    if (!sameFn) {
        return { verdict: "INCONCLUSIVE", reason: "reentered frames are not all the same function", chain: [] };
    }

    const hasSload = containsOp(baseline.p1, "SLOAD");
    const hasSstore = containsOp(baseline.p2, "SSTORE");
    if (!hasSload || !hasSstore) {
        return {
            verdict: "INCONCLUSIVE",
            reason: "repeated frame lacks the read-before-call / write-after-call signature",
            chain: functions.map(f => ({ depth: f.depth, p1Index: f.p1.index, p2Index: f.p2.index }))
        };
    }

    const reentrancyCount = functions.length - 1;
    const functionSelector = extractFunctionSelectorHistorical(baseline.p1);
    const depths = functions.map(f => f.depth);

    return {
        verdict: reentrancyCount > 0 ? "REENTRANCY_DETECTED" : "NOT_REENTRANT",
        reentrancyCount,
        totalInvocationsFound: functions.length,
        functionSelector,
        depths,
        minDepth: Math.min(...depths),
        maxDepth: Math.max(...depths),
        chain: functions.map(f => ({
            depth: f.depth,
            p1Index: f.p1.index,
            p2Index: f.p2.index,
            hasSload: containsOp(f.p1, "SLOAD"),
            hasSstore: containsOp(f.p2, "SSTORE")
        }))
    };
}

function detectStructuralReentrancy(traceContent) {
    const opRecords = parseTraceContent(traceContent);
    const nodes = buildNodes(opRecords);
    assignDepths(nodes);
    const repeatedGroups = findRepeatedNodes(nodes);
    const candidates = filterSplitCandidates(repeatedGroups);
    const byDepth = groupByDepth(candidates);
    const { functions, issues } = composeFunctions(byDepth);
    const chains = splitIntoChains(functions);
    const chainResults = chains.length ? chains.map(classifyStructural) : [classifyStructural([])];

    let primaryChainIndex = 0;
    for (let i = 0; i < chainResults.length; i++) {
        const r = chainResults[i];
        const best = chainResults[primaryChainIndex];
        if (
            r.verdict === "REENTRANCY_DETECTED" &&
            (best.verdict !== "REENTRANCY_DETECTED" || r.reentrancyCount > best.reentrancyCount)
        ) {
            primaryChainIndex = i;
        }
    }
    const overall = chainResults[primaryChainIndex];

    return {
        ...overall,
        nodeCount: nodes.length,
        rawRepeatedGroupCount: repeatedGroups.length,
        composedFunctionCount: functions.length,
        skippedDepthBuckets: issues,
        chains: chainResults,
        primaryChainIndex,
        dataCaveat:
            "victim/attacker address and value-per-call are not recoverable from this " +
            "dataset's tx_trace format - verdict is structural only (see file header)."
    };
}

function fmtMb(n) {
    return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

async function main() {
    const opts = parseArgs(process.argv);
    if (opts.help) {
        console.log(`Usage:
  node database/scripts/mongoReentrancyPipeline.js --limit 50 [--resume] [--json]
  node database/scripts/mongoReentrancyPipeline.js --limit 1000 --skip 0 --batch 5 --max-trace-mb 8 --resume

Start small (50), then 500, then 5000 with --resume. Do not dump --json on huge runs.`);
        return;
    }

    const maxTraceChars = Math.floor(opts.maxTraceMb * 1024 * 1024);
    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 120000
    });

    console.log(`Connecting ${MONGO_URI} …`);
    await client.connect();

    const sourceCol = client.db(SOURCE_DB).collection(SOURCE_COLLECTION);
    const resultsCol = client.db(SOURCE_DB).collection(RESULTS_COLLECTION);
    await resultsCol.createIndex({ tx_hash: 1 }, { unique: true });

    let estimated = null;
    try {
        estimated = await sourceCol.estimatedDocumentCount();
    } catch {
        /* ignore */
    }

    const filter = opts.onlyWithTrace
        ? { tx_trace: { $exists: true, $type: "string", $ne: "" } }
        : {};

    console.log(
        `Source ${SOURCE_DB}.${SOURCE_COLLECTION}` +
            (estimated != null ? ` (~${estimated} docs)` : "") +
            ` | limit=${opts.limit} skip=${opts.skip} batch=${opts.batchSize}` +
            ` maxTrace=${opts.maxTraceMb}MB resume=${opts.resume}`
    );

    const cursor = sourceCol
        .find(filter, {
            projection: {
                tx_hash: 1,
                tx_fromaddr: 1,
                tx_toaddr: 1,
                tx_blocknum: 1,
                tx_timestamp: 1,
                tx_trace: 1
            }
        })
        .sort({ _id: -1 })
        .skip(opts.skip)
        .limit(opts.limit)
        .batchSize(opts.batchSize);

    const summary = {};
    const jsonRows = opts.json ? [] : null;
    let processed = 0;
    let skippedResume = 0;
    let skippedHuge = 0;
    let flagged = 0;
    const t0 = Date.now();

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        processed += 1;

        if (opts.resume && doc.tx_hash) {
            const existing = await resultsCol.findOne(
                { tx_hash: doc.tx_hash },
                { projection: { _id: 1 } }
            );
            if (existing) {
                skippedResume += 1;
                if (processed % 50 === 0) {
                    console.log(
                        `… ${processed}/${opts.limit} processed (${skippedResume} resume-skips, ${flagged} flagged)`
                    );
                }
                continue;
            }
        }

        let detection;
        const trace = doc.tx_trace;
        if (!trace) {
            detection = { verdict: "NO_TRACE", reason: "document has no tx_trace field" };
        } else if (trace.length > maxTraceChars) {
            skippedHuge += 1;
            detection = {
                verdict: "SKIPPED_HUGE_TRACE",
                reason: `tx_trace length ${trace.length} > max ${maxTraceChars}`,
                traceChars: trace.length
            };
        } else {
            try {
                detection = detectStructuralReentrancy(traceFieldToContent(trace));
                // Drop heavy chain payloads from Mongo storage by default — keep summary fields.
                if (detection.chains && detection.chains.length > 3) {
                    detection = {
                        ...detection,
                        chains: detection.chains.slice(0, 3),
                        chainsTruncated: true
                    };
                }
            } catch (err) {
                detection = { verdict: "ERROR", error: err.message };
            }
        }

        if (detection.verdict === "REENTRANCY_DETECTED") flagged += 1;
        summary[detection.verdict] = (summary[detection.verdict] || 0) + 1;

        const record = {
            tx_hash: doc.tx_hash,
            tx_fromaddr: doc.tx_fromaddr,
            tx_toaddr: doc.tx_toaddr,
            tx_blocknum: doc.tx_blocknum,
            tx_timestamp: doc.tx_timestamp,
            detection,
            analyzedAt: new Date(),
            pipeline: "mongoReentrancyPipeline/stream-v2"
        };

        await resultsCol.updateOne({ tx_hash: doc.tx_hash }, { $set: record }, { upsert: true });
        if (jsonRows) jsonRows.push(record);

        // Release reference ASAP
        doc.tx_trace = null;

        if (processed % 25 === 0 || detection.verdict === "REENTRANCY_DETECTED") {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            const mark = detection.verdict === "REENTRANCY_DETECTED" ? " ★" : "";
            console.log(
                `[${processed}/${opts.limit}] ${detection.verdict}` +
                    (doc.tx_hash ? ` ${String(doc.tx_hash).slice(0, 12)}…` : "") +
                    ` | flagged=${flagged} hugeSkip=${skippedHuge} resumeSkip=${skippedResume} ${elapsed}s${mark}`
            );
        }

        // Soft GC hint on large traces
        if (global.gc && processed % 100 === 0) global.gc();
    }

    await cursor.close();

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("\nDone.");
    console.log(`  processed:     ${processed}`);
    console.log(`  resume skipped:${skippedResume}`);
    console.log(`  huge skipped:  ${skippedHuge}`);
    console.log(`  flagged:       ${flagged}`);
    console.log(`  elapsed:       ${elapsed}s`);
    console.log("  verdicts:", summary);
    console.log(`  results → ${SOURCE_DB}.${RESULTS_COLLECTION}`);

    if (jsonRows) {
        const outPath = path.join(__dirname, `../../reentrancy_detection_results_${Date.now()}.json`);
        fs.writeFileSync(outPath, JSON.stringify(jsonRows, null, 2));
        console.log(`  JSON → ${outPath} (${fmtMb(Buffer.byteLength(JSON.stringify(jsonRows)))})`);
    }

    await client.close();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
