// Single-function reentrancy detector (EFG method), matching the hand analysis on
// traces_tests/reenAttack/malicious_scenario/attackCount_0-N (0..5 reentries) and the
// safe_scenario corpus (no false positives).
//
// Algorithm (user principle → implementation):
//   1-2. Input format2; node fingerprints use pc:OP only (= format1 content, no separate file)
//   3.   buildNodes          — split on CALL*/STOP/RETURN/… into indexed call-frame nodes
//   4.   assignDepths        — push on CALL-ending nodes, pop on terminators
//   5.   findRepeatedNodes   — groups with identical pc:OP sequences (length ≥ 2)
//   6.   filterSplitCandidates — keep p1 / pmid / p2 (pmid = mid-frame that resumes then CALLs again)
//   7.   groupByDepth        — bucket surviving nodes by depth
//   8-10.composeFunctions    — at each depth stitch p1 → (pmid)* → p2 with pc continuity
//                            (handles multi-CALL functions like The DAO; also multiple
//                            invocations sharing a depth via per-p1 matching)
//   10b. splitIntoChains     — one chain per distinct p1 signature (victim vs attacker callback)
//   11.  classify            — for one homogeneous chain sorted by depth:
//                            • index(p1) strictly increasing, index(p2) strictly decreasing
//                            • same p1 signature + same CALL target (same function / contract)
//                            • p1 has SLOAD, p2 has SSTORE (CEI violation)
//                            • count reentries beyond the outermost call with value > 0
//
// CLI: node database/scripts/reentrancyDetector.js <path-to-format2.txt>

const fs = require("fs");

const CALL_OPS = new Set(["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2"]);
const TERMINATING_OPS = new Set(["STOP", "RETURN", "REVERT", "INVALID", "SELFDESTRUCT"]);

// --- steps 1-2: parse format2.txt content into flat {pc, op, args[]} records ----------------
function parseTraceContent(raw) {
    return raw
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
            const [pcStr, op, argsStr = ""] = line.split(";");
            const args = argsStr.length ? argsStr.split(",") : [];
            return { pc: parseInt(pcStr, 10), op, args };
        });
}

function parseTraceFile(filePath) {
    return parseTraceContent(fs.readFileSync(filePath, "utf8"));
}

// --- step 3: split the flat trace into call-frame nodes -----------------------------------
// A node ends the instant execution either (a) makes a deeper call (CALL/...) or
// (b) terminates the current frame (STOP/RETURN/REVERT/...). Every node therefore starts
// either at the very beginning of the trace, or immediately after a CALL line (pc = 0, a
// fresh dispatcher entry), or — when it's the continuation resumed after a nested call
// returned — at whatever pc follows that CALL in the caller's own bytecode.
function buildNodes(opRecords) {
    const chunks = [];
    let current = [];
    for (const rec of opRecords) {
        current.push(rec);
        if (CALL_OPS.has(rec.op) || TERMINATING_OPS.has(rec.op)) {
            chunks.push(current);
            current = [];
        }
    }
    if (current.length) chunks.push(current); // dangling frame (trace ended mid-execution)

    return chunks.map((lines, i) => {
        const first = lines[0];
        const last = lines[lines.length - 1];
        return {
            index: i + 1, // 1-based, matching the hand-drawn node numbering (D1 = node 1, ...)
            lines,
            startPc: first.pc,
            endPc: last.pc,
            endOp: last.op,
            endsWithCall: CALL_OPS.has(last.op),
            endsWithTerminator: TERMINATING_OPS.has(last.op),
            // exact content fingerprint used for repeat detection in step 5
            signature: lines.map(l => `${l.pc}:${l.op}`).join("|"),
            depth: null // filled in by assignDepths
        };
    });
}

// --- step 4: reconstruct each node's call-depth ---------------------------------------------
// A CALL-ending node pushes the depth to resume at (its own depth) and steps one level
// deeper for whatever node comes next. A terminator-ending node pops that stack so the
// following node (the caller's continuation) resumes at the caller's own depth.
function assignDepths(nodes) {
    let currentDepth = 1;
    const returnStack = [];
    const depths = [];
    for (const node of nodes) {
        node.depth = currentDepth;
        depths.push({ index: node.index, depth: currentDepth });
        if (node.endsWithCall) {
            returnStack.push(currentDepth);
            currentDepth += 1;
        } else if (node.endsWithTerminator && returnStack.length > 0) {
            currentDepth = returnStack.pop();
        }
    }
    return depths;
}

// --- step 5: find nodes whose exact content repeats elsewhere in the trace -----------------
function findRepeatedNodes(nodes) {
    const bySignature = new Map();
    for (const node of nodes) {
        if (!bySignature.has(node.signature)) bySignature.set(node.signature, []);
        bySignature.get(node.signature).push(node);
    }
    const repeatedGroups = [];
    for (const group of bySignature.values()) {
        if (group.length >= 2) repeatedGroups.push(group);
    }
    return repeatedGroups;
}

// --- step 6: keep split-frame pieces that participate in a suspended invocation ----------
//   p1   = opens at dispatcher entry (pc 0), makes a call, does not finish here
//   pmid = resumes after a call (pc ≠ 0), makes another call, still not finished
//          (The DAO withdraw path has several of these between the value-CALL and the
//          final RETURN/SSTORE — without pmid the p1/p2 continuity check cannot close.)
//   p2   = resumes after a call (pc ≠ 0) and terminates the frame
function classifyNode(node) {
    if (node.startPc === 0 && node.endsWithCall) return "p1";
    if (node.startPc !== 0 && node.endsWithCall) return "pmid";
    if (node.startPc !== 0 && node.endsWithTerminator) return "p2";
    return null;
}

function filterSplitCandidates(repeatedGroups) {
    const candidates = [];
    for (const group of repeatedGroups) {
        for (const node of group) {
            const kind = classifyNode(node);
            if (kind) candidates.push({ ...node, kind });
        }
    }
    return candidates;
}

// --- step 7: bucket the surviving candidates by depth --------------------------------------
function groupByDepth(candidates) {
    const byDepth = new Map();
    for (const c of candidates) {
        if (!byDepth.has(c.depth)) byDepth.set(c.depth, []);
        byDepth.get(c.depth).push(c);
    }
    return byDepth;
}

// Stitch one invocation at a single depth: p1 → (pmid)* → p2 with pc continuity.
// Returns null if no continuous path from this p1 to a terminator exists in `sorted`.
function stitchFromP1(p1, sorted, used) {
    const path = [p1];
    let expectPc = p1.endPc + 1;
    let fromIndex = p1.index;
    while (true) {
        const next = sorted.find(
            n => !used.has(n.index) && n.index > fromIndex && n.startPc === expectPc
        );
        if (!next) return null;
        path.push(next);
        fromIndex = next.index;
        if (next.kind === "p2" || next.endsWithTerminator) {
            return path;
        }
        if (next.kind === "pmid" || next.endsWithCall) {
            expectPc = next.endPc + 1;
            continue;
        }
        return null;
    }
}

// --- steps 8-10: compose (p1 … p2) into one logical function invocation per depth ----------
// CALL is a single-byte opcode, so each resume must start at exactly priorEndPc + 1.
// Simple Sepolia sims: exactly one p1 and one p2 per depth (no pmid).
// DAO-class traces: multiple CALLs inside one function → p1 + pmid* + p2 on the same depth;
// also several distinct invocations can share a depth value over the trace lifetime — pair
// each p1 to its continuous p2 by pc, instead of requiring counts === 1.
function composeFunctions(byDepth) {
    const functions = [];
    const issues = [];
    for (const [depth, group] of byDepth) {
        const sorted = [...group].sort((a, b) => a.index - b.index);
        const p1s = sorted.filter(n => n.kind === "p1");
        const p2s = sorted.filter(n => n.kind === "p2");
        const pmids = sorted.filter(n => n.kind === "pmid");

        if (p1s.length === 0 || p2s.length === 0) {
            issues.push({
                depth,
                p1Count: p1s.length,
                p2Count: p2s.length,
                pmidCount: pmids.length,
                reason: "missing p1 or p2"
            });
            continue;
        }

        const used = new Set();
        let paired = 0;
        for (const p1 of p1s) {
            if (used.has(p1.index)) continue;
            const path = stitchFromP1(p1, sorted, used);
            if (!path) continue;
            for (const n of path) used.add(n.index);
            const p2 = path[path.length - 1];
            paired++;
            functions.push({
                depth,
                p1,
                p2,
                mids: path.slice(1, -1),
                continuityOk: true,
                partCount: path.length
            });
        }

        if (paired === 0) {
            // Fallback identical to the original strict rule (keeps old behavior if stitching
            // cannot connect — e.g. incomplete repeated-mid coverage).
            if (p1s.length === 1 && p2s.length === 1 && pmids.length === 0) {
                const [p1] = p1s;
                const [p2] = p2s;
                functions.push({
                    depth,
                    p1,
                    p2,
                    mids: [],
                    continuityOk: p2.startPc === p1.endPc + 1,
                    partCount: 2
                });
            } else {
                issues.push({
                    depth,
                    p1Count: p1s.length,
                    p2Count: p2s.length,
                    pmidCount: pmids.length,
                    reason: "no continuous p1→p2 path"
                });
            }
        }
    }
    functions.sort((a, b) => a.depth - b.depth || a.p1.index - b.p1.index);
    return { functions, issues };
}

// --- step 11 helpers: decode the value-call ending a p1, and check for an opcode ------------
function decodeCallLine(line) {
    if (line.op !== "CALL" && line.op !== "CALLCODE") return null;
    // reversed-stack args: arg0 = gas, arg1 = to, arg2 = value (see internalTransaction_crud.js)
    const [, toHex, valueHex] = line.args;
    if (!toHex || valueHex === undefined) return null;
    let value;
    try {
        value = BigInt(valueHex.startsWith("0x") ? valueHex : `0x${valueHex}`);
    } catch {
        value = 0n;
    }
    const to = `0x${toHex.replace(/^0x/, "").padStart(40, "0")}`.toLowerCase();
    return { to, value };
}

function containsOp(node, opName) {
    return node.lines.some(l => l.op === opName);
}

// The address whose *code* a given node is actually running is the target of the CALL that
// opened it — that CALL lives in the immediately preceding node in the flat array. This is
// how we recover "the vulnerable contract" itself, as opposed to `decodeCallLine`'s result
// (the address a node's own outgoing CALL sends value *to*, i.e. the attacker/recipient).
function resolveEnteredContract(nodes, nodeIndex) {
    const opener = nodes[nodeIndex - 2]; // nodes[] is 0-based; node.index is 1-based
    if (!opener || !opener.endsWithCall) return null;
    const call = decodeCallLine(opener.lines[opener.lines.length - 1]);
    return call ? call.to : null;
}

// format2's `args` for line i is the stack *before* opcode i executes, so the calldata word
// CALLDATALOAD just loaded shows up as the top-of-stack arg on the very next line - reading
// its first 4 bytes recovers the invoked function's selector without needing memory (format3).
function extractFunctionSelector(node) {
    for (let i = 0; i < node.lines.length - 1; i++) {
        if (node.lines[i].op !== "CALLDATALOAD") continue;
        const word = node.lines[i + 1].args && node.lines[i + 1].args[0];
        if (!word) continue;
        const hex = word.replace(/^0x/, "").padStart(64, "0");
        return `0x${hex.slice(0, 8)}`;
    }
    return null;
}

function weiToEthString(value) {
    if (value === null || value === undefined) return null;
    const v = typeof value === "bigint" ? value : BigInt(value);
    const negative = v < 0n;
    const abs = negative ? -v : v;
    const whole = abs / 1000000000000000000n;
    const fracDigits = (abs % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${fracDigits ? "." + fracDigits : ""}`;
}

// Every branch of classify() below - success or INCONCLUSIVE - reports `chain` in this same
// shape, so a caller (or formatReport) never has to special-case which branch produced it.
function toChainRow(f) {
    const call = "call" in f ? f.call : decodeCallLine(f.p1.lines[f.p1.lines.length - 1]);
    const hasSload = "hasSload" in f ? f.hasSload : containsOp(f.p1, "SLOAD");
    const hasSstore = "hasSstore" in f ? f.hasSstore : containsOp(f.p2, "SSTORE");
    return {
        depth: f.depth,
        p1Index: f.p1.index,
        p2Index: f.p2.index,
        hasSload,
        hasSstore,
        callValueWei: call ? call.value.toString() : null,
        callValueEth: call ? weiToEthString(call.value) : null,
        recipient: call ? call.to : null
    };
}

function normalizeChain(items) {
    return items.map(toChainRow);
}

// --- step 11: verify ordering + content, then count qualifying reentries -------------------
function classify(functions, nodes) {
    if (functions.length === 0) {
        return {
            verdict: "NOT_REENTRANT",
            reentrancyCount: 0,
            reason: "no repeated call-frame pair found",
            chain: []
        };
    }

    // nesting invariant: as depth increases, the opening half's index increases (frames
    // open in order) while the closing half's index decreases (frames unwind in reverse -
    // last opened, first closed). Matches hand EFG: depth(p1)↑, index(p1)↑, index(p2)↓.
    // (depth(p1)==depth(p2) per composed function, so depth(p2) also increases with rank.)
    for (let i = 0; i < functions.length; i++) {
        if (!functions[i].continuityOk) {
            return {
                verdict: "INCONCLUSIVE",
                reason: `p2 does not resume right after p1's CALL at rank ${i} (depth D${functions[i].depth})`,
                chain: normalizeChain(functions)
            };
        }
        if (i === 0) continue;
        if (functions[i].p1.index <= functions[i - 1].p1.index) {
            return { verdict: "INCONCLUSIVE", reason: `p1 index not increasing with depth at rank ${i}`, chain: normalizeChain(functions) };
        }
        if (functions[i].p2.index >= functions[i - 1].p2.index) {
            return { verdict: "INCONCLUSIVE", reason: `p2 index not decreasing with depth at rank ${i}`, chain: normalizeChain(functions) };
        }
    }

    const details = functions.map(f => ({
        ...f,
        call: decodeCallLine(f.p1.lines[f.p1.lines.length - 1]),
        hasSload: containsOp(f.p1, "SLOAD"),
        hasSstore: containsOp(f.p2, "SSTORE")
    }));

    const baseline = details[0];
    if (!baseline.call) {
        return { verdict: "INCONCLUSIVE", reason: "baseline frame does not end in a value-bearing CALL/CALLCODE", chain: normalizeChain(details) };
    }

    // same function, same contract: p1's content is byte-identical across the chain
    // (guaranteed by construction, re-checked here) and every reentrant call targets the
    // same address as the very first one.
    const sameTargetAndFn = details.every(d =>
        d.p1.signature === baseline.p1.signature && d.call && d.call.to === baseline.call.to
    );
    if (!sameTargetAndFn) {
        return { verdict: "INCONCLUSIVE", reason: "reentered frames do not all target the same contract/function", chain: normalizeChain(details) };
    }

    // the CEI-violation signature itself: state read before the external call, state
    // written only after it returns. Checked once — every frame in the chain shares the
    // same p1/p2 content, so this holds (or fails) for all of them together.
    if (!baseline.hasSload || !baseline.hasSstore) {
        return {
            verdict: "INCONCLUSIVE",
            reason: "repeated frame lacks the read-before-call / write-after-call signature",
            chain: normalizeChain(details)
        };
    }

    // count how many reentries beyond the original call actually carried value out -
    // this is what makes it an exploited drain rather than a merely-attempted one.
    let reentrancyCount = 0;
    let drainedWei = 0n;
    for (let i = 1; i < details.length; i++) {
        if (details[i].call && details[i].call.value > 0n) {
            reentrancyCount++;
            drainedWei += details[i].call.value;
        } else {
            break; // first attempt that didn't complete a value-bearing call ends the chain
        }
    }

    const victimContract = resolveEnteredContract(nodes, baseline.p1.index);
    const functionSelector = extractFunctionSelector(baseline.p1);
    const depths = details.map(d => d.depth);

    return {
        verdict: reentrancyCount > 0 ? "REENTRANCY_DETECTED" : "NOT_REENTRANT",
        reentrancyCount,
        totalInvocationsFound: details.length,
        // the contract whose bytecode is actually being re-executed (the vulnerable one)
        victimContract,
        functionSelector,
        // the address every one of the vulnerable function's outgoing calls sends value to
        attackerAddress: baseline.call.to,
        valuePerCallWei: baseline.call.value.toString(),
        valuePerCallEth: weiToEthString(baseline.call.value),
        totalDrainedWei: drainedWei.toString(),
        totalDrainedEth: weiToEthString(drainedWei),
        depths,
        minDepth: Math.min(...depths),
        maxDepth: Math.max(...depths),
        chain: normalizeChain(details)
    };
}

// composeFunctions sorts everything by depth into ONE flat list, but a trace can contain
// several *distinct* repeated blocks at once — e.g. the victim's own function reopening at
// depths 2,4,6,8 AND the attacker's callback reopening at depths 3,5,7 in between. Those are
// different logical functions and must not be checked against each other; split back out into
// one homogeneous chain per matching p1 content (exactly the separate bracket groups drawn by
// hand for each case) before classifying.
function splitIntoChains(functions) {
    const bySignature = new Map();
    for (const f of functions) {
        if (!bySignature.has(f.p1.signature)) bySignature.set(f.p1.signature, []);
        bySignature.get(f.p1.signature).push(f);
    }
    return [...bySignature.values()].map(chain => chain.sort((a, b) => a.depth - b.depth));
}

// --- orchestrator ----------------------------------------------------------------------------
// Both entry points below share this core - detectReentrancy(filePath) for reading a
// format2.txt off disk, detectReentrancyFromContent(text) for when the trace text already
// lives elsewhere (e.g. a database column) and writing it to a temp file first would just be
// unnecessary ceremony for a caller (such as an orchestrating agent) that already has it in hand.
function runDetection(opRecords) {
    const nodes = buildNodes(opRecords);
    assignDepths(nodes);
    const repeatedGroups = findRepeatedNodes(nodes);
    const candidates = filterSplitCandidates(repeatedGroups);
    const byDepth = groupByDepth(candidates);
    const { functions, issues } = composeFunctions(byDepth);

    const chains = splitIntoChains(functions);
    const chainResults = chains.length ? chains.map(chain => classify(chain, nodes)) : [classify([], nodes)];

    // the overall verdict is whichever chain actually proved an exploited, value-bearing
    // reentry - that's the vulnerable function being reentered, as opposed to e.g. the
    // attacker's own callback chain (same shape, but its calls carry no value and it won't
    // pass the sload/sstore + value>0 checks).
    let primaryChainIndex = 0;
    for (let i = 0; i < chainResults.length; i++) {
        const r = chainResults[i];
        const best = chainResults[primaryChainIndex];
        if (r.verdict === "REENTRANCY_DETECTED" &&
            (best.verdict !== "REENTRANCY_DETECTED" || r.reentrancyCount > best.reentrancyCount)) {
            primaryChainIndex = i;
        }
    }
    const overall = chainResults[primaryChainIndex];

    return {
        ...overall,
        nodeCount: nodes.length,
        // step 5's raw content-repeat groups, BEFORE p1/p2 pairing - e.g. a single-function
        // reentrancy chain with n reentries normally yields 4 of these: the victim's open
        // half repeating, the victim's close half repeating, and the same two halves for the
        // attacker's callback. Do not confuse this with chains.length below.
        rawRepeatedGroupCount: repeatedGroups.length,
        rawRepeatedGroups: repeatedGroups.map(g => ({
            nodeIndices: g.map(n => n.index),
            depths: g.map(n => n.depth),
            kind: g[0].startPc === 0 ? "open (p1-shaped)" : "close (p2-shaped)"
        })),
        composedFunctionCount: functions.length,
        skippedDepthBuckets: issues,
        chains: chainResults, // one entry per DISTINCT function reconstructed (victim, attacker callback, ...)
        primaryChainIndex
    };
}

function detectReentrancy(filePath) {
    return runDetection(parseTraceFile(filePath));
}

function detectReentrancyFromContent(traceContent) {
    return runDetection(parseTraceContent(traceContent));
}

// --- human-readable analysis report --------------------------------------------------------
function formatChainTable(chain) {
    const lines = [];
    lines.push("  depth  p1@node  p2@node  sload  sstore  value(ETH)      recipient");
    for (const c of chain) {
        lines.push(
            `  D${String(c.depth).padEnd(5)} ${String(c.p1Index).padEnd(8)} ${String(c.p2Index).padEnd(8)} ` +
            `${String(c.hasSload).padEnd(6)} ${String(c.hasSstore).padEnd(7)} ${String(c.callValueEth).padEnd(15)} ${c.recipient}`
        );
    }
    return lines;
}

function formatReport(result, sourceFile) {
    const lines = [];
    lines.push("=".repeat(70));
    lines.push(`REENTRANCY ANALYSIS${sourceFile ? `: ${sourceFile}` : ""}`);
    lines.push("=".repeat(70));
    lines.push(`Verdict:              ${result.verdict}`);
    if (result.reason) lines.push(`Reason:               ${result.reason}`);
    lines.push(`Nodes in trace:       ${result.nodeCount}`);
    lines.push(`Repeated groups (step 5, raw, before p1/p2 pairing): ${result.rawRepeatedGroupCount ?? 0}`);
    if (result.rawRepeatedGroups && result.rawRepeatedGroups.length) {
        for (const g of result.rawRepeatedGroups) {
            lines.push(`  - nodes [${g.nodeIndices.join(",")}] -> depths [${g.depths.map(d => "D" + d).join(",")}]  (${g.kind})`);
        }
    }
    lines.push(`Distinct functions reconstructed (after pairing): ${result.chains ? result.chains.length : 0}`);

    if (result.victimContract) {
        lines.push("");
        lines.push(`Vulnerable contract:  ${result.victimContract}`);
        if (result.functionSelector) lines.push(`Function selector:    ${result.functionSelector}`);
        lines.push(`Recipient of funds:   ${result.attackerAddress}`);
        lines.push(`Value per call:       ${result.valuePerCallEth} ETH (${result.valuePerCallWei} wei)`);
        lines.push(`Reentries detected:   ${result.reentrancyCount} (of ${result.totalInvocationsFound} total invocations found)`);
        lines.push(`Total value drained:  ${result.totalDrainedEth} ETH (${result.totalDrainedWei} wei) — beyond the original call`);
        lines.push(`Depth range:          D${result.minDepth} .. D${result.maxDepth}`);
    }

    if (result.chains && result.chains.length) {
        result.chains.forEach((chainResult, i) => {
            const isWinner = i === result.primaryChainIndex;
            lines.push("");
            lines.push(`--- Function chain${chainResult.victimContract ? ` @ ${chainResult.victimContract}` : ""} ${isWinner ? "(PRIMARY - this one drove the verdict above)" : "(other repeated block found in the same trace)"} ---`);
            lines.push(`verdict=${chainResult.verdict}${chainResult.reason ? `, reason=${chainResult.reason}` : ""}`);
            if (chainResult.chain && chainResult.chain.length) {
                lines.push(...formatChainTable(chainResult.chain));
            }
        });
    }

    if (result.skippedDepthBuckets && result.skippedDepthBuckets.length) {
        lines.push("");
        lines.push(`Note: ${result.skippedDepthBuckets.length} depth bucket(s) had an ambiguous p1/p2 count and were skipped:`);
        for (const issue of result.skippedDepthBuckets) {
            lines.push(`  depth D${issue.depth}: p1 count=${issue.p1Count}, p2 count=${issue.p2Count}`);
        }
    }

    lines.push("=".repeat(70));
    return lines.join("\n");
}

module.exports = {
    parseTraceContent,
    parseTraceFile,
    buildNodes,
    assignDepths,
    findRepeatedNodes,
    classifyNode,
    filterSplitCandidates,
    groupByDepth,
    composeFunctions,
    decodeCallLine,
    resolveEnteredContract,
    extractFunctionSelector,
    weiToEthString,
    toChainRow,
    normalizeChain,
    classify,
    splitIntoChains,
    detectReentrancy,
    detectReentrancyFromContent,
    formatReport
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const wantsJson = args.includes("--json");
    const filePath = args.find(a => !a.startsWith("--"));
    if (!filePath) {
        console.error("Usage: node database/scripts/reentrancyDetector.js <path-to-format2.txt> [--json]");
        process.exit(1);
    }
    const result = detectReentrancy(filePath);
    if (wantsJson) {
        const bigIntSafe = (key, value) => (typeof value === "bigint" ? value.toString() : value);
        console.log(JSON.stringify(result, bigIntSafe, 2));
    } else {
        console.log(formatReport(result, filePath));
    }
}
