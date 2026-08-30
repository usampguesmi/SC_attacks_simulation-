const pool = require("../db");
const CALL_OPS = new Set(["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2"]);
const RETURN_OPS = new Set(["RETURN", "REVERT", "STOP", "INVALID", "SELFDESTRUCT"]);
const fs = require("fs");
const path = require("path");
async function createInternalTransaction(
    txId,
    callDepth,
    callType,
    callIndex,
    startOpcodeIndex,
    endOpcodeIndex,
    mainTxId
) {
    const query = `
        INSERT INTO internal_transaction (
            tx_id,
            call_depth,
            call_type,
            call_index,
            start_opcode_index,
            end_opcode_index,
            main_tx_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

    const values = [
        txId,
        callDepth,
        callType,
        callIndex,
        startOpcodeIndex,
        endOpcodeIndex,
        mainTxId
    ];

    await pool.query(query, values);
}

function detectInternalCalls(structLogs) {
    const openFrames = [];
    const calls = [];

    for (let i = 0; i < structLogs.length; i++) {
        const step = structLogs[i];

        if (CALL_OPS.has(step.op)) {
            openFrames.push({
                call_depth: step.depth + 1,
                call_type: step.op,
                call_index: i,
                call_order: null,
                start_opcode_index: i + 1,
                end_opcode_index: null
            });
            continue;
        }

        if (RETURN_OPS.has(step.op) && openFrames.length > 0) {
            const top = openFrames[openFrames.length - 1];
            if (step.depth === top.call_depth) {
                top.end_opcode_index = i;
                calls.push(openFrames.pop());
            }
        }
    }

    while (openFrames.length > 0) {
        const top = openFrames.pop();
        top.end_opcode_index = structLogs.length - 1;
        calls.push(top);
    }

    calls.sort((a, b) => a.call_index - b.call_index);
    calls.forEach((call, idx) => { call.call_order = idx + 1; });

    // attach the same 3 trace formats saveTrace produces, scoped to this call's own slice
    for (const call of calls) {
        const slice = structLogs.slice(call.start_opcode_index, call.end_opcode_index + 1);

        call.opcode_traces = slice
            .map(log => `${log.pc};${log.op}`)
            .join("\n");

        call.opcode_stack_traces = slice
            .map(log => {
                const stack = Array.isArray(log.stack) ? [...log.stack].reverse() : [];
                const args = stack.map(v => v.startsWith("0x") ? v : `0x${v}`).join(",");
                return `${log.pc};${log.op};${args}`;
            })
            .join("\n");

        call.full_evm_exec_traces = JSON.stringify(slice, null, 2);
    }

    return calls;
}

async function main(structLogs) {
    const internalCalls = detectInternalCalls(structLogs);
    console.log(`Detected ${internalCalls.length} internal call(s):`);
    console.log(JSON.stringify(internalCalls, null, 2));
    return internalCalls;
}

async function saveInternalCallTraces(calls, outputDir, filePrefix) {
    fs.mkdirSync(outputDir, { recursive: true });

    for (const call of calls) {
        const base = `${filePrefix}-call${call.call_order}`;

        fs.writeFileSync(path.join(outputDir, `${base}-format1.txt`), call.opcode_traces);
        fs.writeFileSync(path.join(outputDir, `${base}-format2.txt`), call.opcode_stack_traces);
        fs.writeFileSync(path.join(outputDir, `${base}-format3.json`), call.full_evm_exec_traces);
    }

    return calls.map(call => ({
        call_order: call.call_order,
        call_type: call.call_type,
        call_depth: call.call_depth,
        format1Path: path.join(outputDir, `${filePrefix}-call${call.call_order}-format1.txt`),
        format2Path: path.join(outputDir, `${filePrefix}-call${call.call_order}-format2.txt`),
        format3Path: path.join(outputDir, `${filePrefix}-call${call.call_order}-format3.json`)
    }));
}

module.exports = {
    createInternalTransaction
};

// --- example: run directly against a real trace file ---
if (require.main === module) {
    const filePath = path.join(__dirname, "../../test_traces/attack_zero-format3.json");
    const trace = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const calls = detectInternalCalls(trace.structLogs);

    console.log(`Detected ${calls.length} internal call(s):`);
    console.log(JSON.stringify(
        calls.map(({ opcode_traces, opcode_stack_traces, full_evm_exec_traces, ...rest }) => rest),
        null, 2
    ));

    const filePrefix = path.basename(filePath, "-format3.json");

    saveInternalCallTraces(calls, "./traces/internal_calls", filePrefix)
        .then((written) => {
            console.log(`Wrote files for ${written.length} internal call(s).`);
        });
}