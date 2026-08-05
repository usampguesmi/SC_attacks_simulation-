const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Save the execution trace of a transaction in three formats.
 *
 * @param {string} txHash Transaction hash.
 * @param {string} outputDir Directory where the files will be written.
 * @param {string} filePrefix Prefix of the output files.
 */
async function saveTrace(txHash, outputDir, filePrefix) {
    const trace = await ethers.provider.send(
        "debug_traceTransaction",
        [
            txHash,
            {
                disableMemory: false,
                disableStack: false,
                disableStorage: false
            }
        ]
    );

    // ---------- Format 1 ----------
    const opcodeSequence = trace.structLogs.map(
        log => `${log.pc};${log.op}`
    );

    fs.writeFileSync(
        path.join(outputDir, `${filePrefix}-format1.txt`),
        opcodeSequence.join("\n")
    );

    // ---------- Format 2 ----------
    const opcodeSequenceWithArgs = trace.structLogs.map(log => {
        const stack = Array.isArray(log.stack)
            ? [...log.stack].reverse()
            : [];

        const args = stack
            .map(value =>
                value.startsWith("0x") ? value : `0x${value}`
            )
            .join(",");

        return `${log.pc};${log.op};${args}`;
    });

    fs.writeFileSync(
        path.join(outputDir, `${filePrefix}-format2.txt`),
        opcodeSequenceWithArgs.join("\n")
    );

    // ---------- Format 3 ----------
    fs.writeFileSync(
        path.join(outputDir, `${filePrefix}-format3.json`),
        JSON.stringify(trace, null, 2)
    );

    return trace;
}

module.exports = {
    saveTrace
};