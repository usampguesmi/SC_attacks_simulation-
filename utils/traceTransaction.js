const { ethers } = require("hardhat");
const path = require("path");

const {
    savePatchedGethFormat
} = require("./convertToPatchedGethFormat");

async function main() {
   const txHash = process.env.TX_HASH;

    if (!txHash) {
        throw new Error(
            "Missing transaction hash.\n" +
            "Usage: npx hardhat run scripts/trace/traceTransaction.js " +
            "--network localhost -- <transactionHash>"
        );
    }

    console.log("Tracing transaction:", txHash);

    const receipt = await ethers.provider.getTransactionReceipt(txHash);

    if (!receipt) {
        throw new Error(
            `Transaction not found or not mined: ${txHash}`
        );
    }

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

    const outputDir = path.join(
        __dirname,
        "../../traces"
    );

    const shortHash = txHash.slice(2, 12);

    const outputPath = savePatchedGethFormat(
        trace,
        outputDir,
        `trace-${shortHash}`
    );

    console.log("Transaction status:", receipt.status);
    console.log("Block number:", receipt.blockNumber);
    console.log("Trace steps:", trace.structLogs.length);
    console.log("Trace saved to:", outputPath);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});