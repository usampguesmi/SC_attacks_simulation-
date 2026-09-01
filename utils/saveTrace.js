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
console.log("structLogs length:", trace.structLogs.length);
    // ---------- Format 1 ----------
    const opcodeSequence = trace.structLogs.map(
        log => `${log.pc};${log.op}`
    );

    const opcodeCount = opcodeSequence.length;

    const format1 = opcodeSequence.join("\n");
    fs.writeFileSync(path.join(outputDir, `${filePrefix}-format1.txt`), format1);

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

    const format2 = opcodeSequenceWithArgs.join("\n");
    fs.writeFileSync(path.join(outputDir, `${filePrefix}-format2.txt`), format2);


    // ---------- Format 3 ----------
    const format3 = JSON.stringify(trace, null, 2);
    fs.writeFileSync(path.join(outputDir, `${filePrefix}-format3.json`), format3);

 return { trace, format1, format2, format3, opcodeCount };
}

module.exports = {
    saveTrace
};