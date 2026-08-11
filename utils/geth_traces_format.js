const fs = require("fs");
const path = require("path");

function normalizeHex(value) {
    if (typeof value !== "string" || value.length === 0) {
        return "0x0";
    }

    return value.startsWith("0x") ? value : `0x${value}`;
}

function hexToDecimal(value) {
    try {
        return BigInt(normalizeHex(value)).toString(10);
    } catch {
        return "";
    }
}

function stackTop(log, position = 0) {
    if (!log || !Array.isArray(log.stack)) {
        return undefined;
    }

    const index = log.stack.length - 1 - position;

    if (index < 0) {
        return undefined;
    }

    return log.stack[index];
}

/**
 * Find the state immediately after an opcode has completed.
 *
 * For ordinary opcodes this is usually structLogs[index + 1].
 * For CALL-like opcodes, execution first enters a deeper frame, so we
 * search for the first later entry that returns to the original depth.
 */
function findPostExecutionLog(structLogs, index) {
    const current = structLogs[index];

    for (let i = index + 1; i < structLogs.length; i++) {
        const candidate = structLogs[i];

        if (candidate.depth === current.depth) {
            return candidate;
        }

        if (candidate.depth < current.depth) {
            return null;
        }
    }

    return null;
}

const RESULT_FROM_NEW_STACK_TOP = new Set([
    "PUSH0",
    "PUSH1",
    "PUSH2",
    "PUSH3",
    "PUSH4",
    "PUSH5",
    "PUSH6",
    "PUSH7",
    "PUSH8",
    "PUSH9",
    "PUSH10",
    "PUSH11",
    "PUSH12",
    "PUSH13",
    "PUSH14",
    "PUSH15",
    "PUSH16",
    "PUSH17",
    "PUSH18",
    "PUSH19",
    "PUSH20",
    "PUSH21",
    "PUSH22",
    "PUSH23",
    "PUSH24",
    "PUSH25",
    "PUSH26",
    "PUSH27",
    "PUSH28",
    "PUSH29",
    "PUSH30",
    "PUSH31",
    "PUSH32",

    "ADD",
    "SUB",
    "MUL",
    "DIV",
    "SDIV",
    "MOD",
    "SMOD",
    "ADDMOD",
    "MULMOD",
    "EXP",
    "SIGNEXTEND",

    "LT",
    "GT",
    "SLT",
    "SGT",
    "EQ",
    "ISZERO",

    "AND",
    "OR",
    "XOR",
    "NOT",
    "BYTE",
    "SHL",
    "SHR",
    "SAR",

    "KECCAK256",
    "ADDRESS",
    "BALANCE",
    "ORIGIN",
    "CALLER",
    "CALLVALUE",
    "CALLDATALOAD",
    "CALLDATASIZE",
    "CODESIZE",
    "GASPRICE",
    "EXTCODESIZE",
    "EXTCODEHASH",
    "RETURNDATASIZE",

    "BLOCKHASH",
    "COINBASE",
    "TIMESTAMP",
    "NUMBER",
    "DIFFICULTY",
    "PREVRANDAO",
    "GASLIMIT",
    "CHAINID",
    "SELFBALANCE",
    "BASEFEE",
    "BLOBHASH",
    "BLOBBASEFEE",

    "MLOAD",
    "SLOAD",
    "PC",
    "MSIZE",
    "GAS",

    "CREATE",
    "CREATE2"
]);

const EMPTY_RESULT_OPCODES = new Set([
    "STOP",
    "POP",

    "MSTORE",
    "MSTORE8",
    "SSTORE",

    "JUMP",
    "JUMPI",
    "JUMPDEST",

    "CALLDATACOPY",
    "CODECOPY",
    "RETURNDATACOPY",
    "EXTCODECOPY",
    "MCOPY",

    "DUP1",
    "DUP2",
    "DUP3",
    "DUP4",
    "DUP5",
    "DUP6",
    "DUP7",
    "DUP8",
    "DUP9",
    "DUP10",
    "DUP11",
    "DUP12",
    "DUP13",
    "DUP14",
    "DUP15",
    "DUP16",

    "SWAP1",
    "SWAP2",
    "SWAP3",
    "SWAP4",
    "SWAP5",
    "SWAP6",
    "SWAP7",
    "SWAP8",
    "SWAP9",
    "SWAP10",
    "SWAP11",
    "SWAP12",
    "SWAP13",
    "SWAP14",
    "SWAP15",
    "SWAP16",

    "LOG0",
    "LOG1",
    "LOG2",
    "LOG3",
    "LOG4",

    "SELFDESTRUCT"
]);

function getCallResult(structLogs, index) {
    const postLog = findPostExecutionLog(structLogs, index);

    if (!postLog) {
        return "0,0";
    }

    // CALL-like instructions push 0 or 1 onto the caller's stack.
    const success = hexToDecimal(stackTop(postLog));

    /*
     * The ordinary structLogs output doesn't directly provide the child
     * call's complete return bytes as a dedicated field.
     *
     * "0" is therefore used as a fallback. It matches calls with empty
     * return data, but isn't exact for calls returning non-empty bytes.
     */
    const returnData = "0";

    return `${success},${returnData}`;
}

function deriveGethResult(structLogs, index) {
    const current = structLogs[index];
    const op = current.op.toUpperCase();
    const postLog = findPostExecutionLog(structLogs, index);

    if (
        op === "CALL" ||
        op === "CALLCODE" ||
        op === "DELEGATECALL" ||
        op === "STATICCALL"
    ) {
        return getCallResult(structLogs, index);
    }

    if (op === "RETURN" || op === "REVERT") {
        /*
         * The current stack contains:
         * top     = memory offset
         * top - 1 = data size
         *
         * Extracting the exact bytes requires slicing current.memory.
         */
        return extractReturnDataAsDecimal(current);
    }

    if (RESULT_FROM_NEW_STACK_TOP.has(op)) {
        if (!postLog) {
            return "";
        }

        return hexToDecimal(stackTop(postLog));
    }

    if (EMPTY_RESULT_OPCODES.has(op)) {
        return "";
    }

    return "";
}

function memoryWordsToBuffer(memory) {
    if (!Array.isArray(memory) || memory.length === 0) {
        return Buffer.alloc(0);
    }

    const hex = memory
        .map(word => word.startsWith("0x") ? word.slice(2) : word)
        .join("");

    return Buffer.from(hex, "hex");
}

function extractReturnDataAsDecimal(log) {
    try {
        const offset = Number(BigInt(normalizeHex(stackTop(log, 0))));
        const size = Number(BigInt(normalizeHex(stackTop(log, 1))));

        if (size === 0) {
            return "0";
        }

        const memory = memoryWordsToBuffer(log.memory);
        const data = memory.subarray(offset, offset + size);

        if (data.length === 0) {
            return "0";
        }

        return BigInt(`0x${data.toString("hex")}`).toString(10);
    } catch {
        return "";
    }
}

function convertToPatchedGethFormat(trace) {
    if (!trace || !Array.isArray(trace.structLogs)) {
        throw new TypeError(
            "Invalid trace: expected an object containing structLogs"
        );
    }

    return trace.structLogs.map((log, index) => {
        const result = deriveGethResult(trace.structLogs, index);

        return `|${log.pc};${log.op};${result}`;
    });
}

function savePatchedGethFormat(trace, outputDir, filePrefix) {
    fs.mkdirSync(outputDir, { recursive: true });

    const lines = convertToPatchedGethFormat(trace);

    const outputPath = path.join(
        outputDir,
        `${filePrefix}-geth-format.txt`
    );

    fs.writeFileSync(outputPath, lines.join("\n"));

    return outputPath;
}

module.exports = {
    convertToPatchedGethFormat,
    savePatchedGethFormat
};