const fs = require("fs");
const path = require("path");

/**
 * Convert a debug_traceTransaction result into:
 *
 * pc;OPCODE;argument1,argument2,...
 *
 * The stack is reversed so that the top-of-stack value appears first.
 *
 * @param {object} trace Result returned by debug_traceTransaction.
 * @param {string} outputDir Directory where the trace will be saved.
 * @param {string} filePrefix Output filename without extension.
 * @returns {string} Full path of the generated file.
 */
function savePatchedGethFormat(trace, outputDir, filePrefix) {
    if (!trace || !Array.isArray(trace.structLogs)) {
        throw new Error(
            "Invalid trace: expected an object containing structLogs."
        );
    }

    if (!outputDir || typeof outputDir !== "string") {
        throw new Error("Invalid output directory.");
    }

    if (!filePrefix || typeof filePrefix !== "string") {
        throw new Error("Invalid file prefix.");
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const lines = trace.structLogs.map(log => {
        const pc = log.pc;
        const opcode = log.op;

        /*
         * debug_traceTransaction stores the EVM stack from bottom to top.
         * Reverse it so the top of the stack is shown first.
         */
        const stack = Array.isArray(log.stack)
            ? [...log.stack].reverse()
            : [];

        const argumentsString = stack
            .map(value => {
                const normalized = String(value);
                return normalized.startsWith("0x")
                    ? normalized
                    : `0x${normalized}`;
            })
            .join(",");

        return `${pc};${opcode};${argumentsString}`;
    });

    const outputPath = path.join(
        outputDir,
        `${filePrefix}.txt`
    );

    fs.writeFileSync(
        outputPath,
        lines.join("\n"),
        "utf8"
    );

    return outputPath;
}

module.exports = {
    savePatchedGethFormat
};