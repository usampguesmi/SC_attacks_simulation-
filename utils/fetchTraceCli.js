// One-off CLI bridge for the Reentry Ledger artifact's "Transaction Hash" tab: a published
// Artifact's sandbox blocks outbound fetch() to anything but a small CDN allowlist, so it can
// never call debug_traceTransaction directly against a real RPC endpoint. This script does that
// fetch locally instead (reusing saveTrace.js, the same helper the rest of this project already
// uses) and prints the format2 content so it can be pasted into the artifact's Raw Trace tab.
//
// Usage:
//   TX_HASH=0x... npx hardhat run utils/fetchTraceCli.js --network sepolia
const path = require("path");
const { saveTrace } = require("./saveTrace.js");

async function main() {
    const txHash = process.env.TX_HASH;
    if (!txHash) {
        throw new Error("Set TX_HASH to the transaction hash to fetch, e.g.:\n  TX_HASH=0x... npx hardhat run utils/fetchTraceCli.js --network sepolia");
    }
    const outputDir = path.join(__dirname, "../tmp_traces");
    const { format2 } = await saveTrace(txHash, outputDir, "manual");
    console.log("\n--- format2 trace (copy everything below into Reentry Ledger's Raw Trace tab) ---\n");
    console.log(format2);
    console.log(`\n--- also saved to ${outputDir}/manual-format2.txt ---`);
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
