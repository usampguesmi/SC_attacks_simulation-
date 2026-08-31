const pool = require("../db");
const fs = require("fs");
const path = require("path");

const CALL_OPS = new Set(["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2"]);
const RETURN_OPS = new Set(["RETURN", "REVERT", "STOP", "INVALID", "SELFDESTRUCT"]);

async function createInternalTransaction(
    txId, callDepth, callType, callIndex, startOpcodeIndex, endOpcodeIndex, mainTxId
) {
    const query = `
        INSERT INTO internal_transaction (
            tx_id, call_depth, call_type, call_index,
            start_opcode_index, end_opcode_index, main_tx_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    const values = [txId, callDepth, callType, callIndex, startOpcodeIndex, endOpcodeIndex, mainTxId];
    await pool.query(query, values);
}

function decodeCallValue(step) {
    if (!Array.isArray(step.stack)) return null;
    if (step.op !== "CALL" && step.op !== "CALLCODE") return "0";
    const s = step.stack;
    const valueHex = s[s.length - 3];
    if (!valueHex) return "0";
    try {
        return BigInt("0x" + valueHex.replace(/^0x/, "")).toString();
    } catch {
        return "0";
    }
}

// --- MISSING FROM THIS VERSION - decodes the CALL's target address ---
function decodeCallTarget(step) {
    if (!Array.isArray(step.stack)) return null;
    if (step.op === "CREATE" || step.op === "CREATE2") return null;
    const s = step.stack;
    const addrHex = s[s.length - 2];
    if (!addrHex) return null;
    return "0x" + addrHex.replace(/^0x/, "").slice(-40).padStart(40, "0");
}

function detectInternalCalls(structLogs, txContext = {}) {
    const openFrames = [];
    const calls = [];
    const addressStack = [txContext.rootAddress ?? null]; // <- MISSING: this is what rootAddress feeds into

    for (let i = 0; i < structLogs.length; i++) {
        const step = structLogs[i];

        if (CALL_OPS.has(step.op)) {
            const fromAddress = addressStack[addressStack.length - 1]; // <- MISSING
            const toAddress = decodeCallTarget(step);                  // <- MISSING

            openFrames.push({
                call_depth: step.depth + 1,
                call_type: step.op,
                call_index: i,
                call_order: null,
                start_opcode_index: i + 1,
                end_opcode_index: null,
                value: decodeCallValue(step),
                from_address: fromAddress,  // <- MISSING
                to_address: toAddress,      // <- MISSING
                _startGas: structLogs[i + 1] ? structLogs[i + 1].gas : null
            });

            addressStack.push(toAddress); // <- MISSING
            continue;
        }

        if (RETURN_OPS.has(step.op) && openFrames.length > 0) {
            const top = openFrames[openFrames.length - 1];
            if (step.depth === top.call_depth) {
                top.end_opcode_index = i;
                top._endGas = step.gas;
                calls.push(openFrames.pop());
                addressStack.pop(); // <- MISSING
            }
        }
    }

    while (openFrames.length > 0) {
        const top = openFrames.pop();
        top.end_opcode_index = structLogs.length - 1;
        top._endGas = structLogs[structLogs.length - 1].gas;
        calls.push(top);
    }

    calls.sort((a, b) => a.call_index - b.call_index);
    calls.forEach((call, idx) => { call.call_order = idx + 1; });

    for (const call of calls) {
        const slice = structLogs.slice(call.start_opcode_index, call.end_opcode_index + 1);

        call.opcode_traces = slice.map(log => `${log.pc};${log.op}`).join("|");
        call.opcode_stack_traces = slice
            .map(log => {
                const stack = Array.isArray(log.stack) ? [...log.stack].reverse() : [];
                const args = stack.map(v => v.startsWith("0x") ? v : `0x${v}`).join(",");
                return `${log.pc};${log.op};${args}`;
            })
            .join("|");
        call.full_evm_exec_traces = JSON.stringify(slice, null, 2);

        call.traces_length = slice.length;
        call.gas_used = (call._startGas != null && call._endGas != null)
            ? call._startGas - call._endGas
            : null;
        call.block_number = txContext.blockNumber ?? null;
        call.timestamp = txContext.timestamp ?? null;

        delete call._startGas;
        delete call._endGas;
    }

    return calls;
}

async function saveInternalCallTraces(calls, baseOutputDir, folderName) {
    const txFolder = path.join(baseOutputDir, folderName);
    fs.mkdirSync(txFolder, { recursive: true });

    const fileInfo = calls.map((call) => {
        const base = `call${call.call_order}`;
        const format1Path = path.join(txFolder, `${base}-format1.txt`);
        const format2Path = path.join(txFolder, `${base}-format2.txt`);
        const format3Path = path.join(txFolder, `${base}-format3.json`);

        fs.writeFileSync(format1Path, call.opcode_traces);
        fs.writeFileSync(format2Path, call.opcode_stack_traces);
        fs.writeFileSync(format3Path, call.full_evm_exec_traces);

        return { call_order: call.call_order, call_type: call.call_type, call_depth: call.call_depth,
                  format1Path, format2Path, format3Path };
    });

    return { folder: txFolder, files: fileInfo, calls };
}

module.exports = {
    createInternalTransaction,
    detectInternalCalls,
    saveInternalCallTraces,
    decodeCallValue,
    decodeCallTarget
};

// --- example: run directly against a real trace file when this file is executed on its own ---
if (require.main === module) {
    const filePath = path.join(__dirname, "../../test_traces/attack_zero-format3.json");
    const trace = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const calls = detectInternalCalls(trace.structLogs, {
        blockNumber: 11543258,
        timestamp: new Date(),
        rootAddress: "0xYourTransactionsToAddressHere" // required for correct from_address tracking
    });

    console.log(`Detected ${calls.length} internal call(s):`);
    console.log(JSON.stringify(
        calls.map(({ opcode_traces, opcode_stack_traces, full_evm_exec_traces, ...rest }) => rest),
        null, 2
    ));

    const folderName = path.basename(filePath, "-format3.json");

    saveInternalCallTraces(calls, "./traces/internal_calls", folderName)
        .then((result) => {
            console.log("Folder created:", result.folder);
            console.log(`Wrote files for ${result.files.length} internal call(s).`);
        });
}