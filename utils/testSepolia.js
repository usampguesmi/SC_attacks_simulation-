

const { ethers } = require("hardhat");
const { saveTrace } = require("./saveTrace.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {

    console.log("=".repeat(60));
    console.log("TEST: saveTrace");
    console.log("=".repeat(60));

    // ── use a real Sepolia tx hash ──────────────────────────
    // replace with your own recent tx hash if needed
    const txHash = "0x36ce959c9096a96b1e08b72e35a9919470383f2c802d2d368735acc6021cc06c";
    console.log("\nTransaction hash:", txHash);

    // ── output directory ────────────────────────────────────
    const outputDir = path.join(__dirname, "../traces/test");
    fs.mkdirSync(outputDir, { recursive: true });
    console.log("Output directory:", outputDir);

    // ── run saveTrace ───────────────────────────────────────
    console.log("\nRunning saveTrace...");
    const { trace, format1, format2, format3, opcodeCount } =
        await saveTrace(txHash, outputDir, "test");

    // ── results ─────────────────────────────────────────────
    console.log("\n=== RESULTS ===");
    console.log("Total opcodes:        ", opcodeCount);
    console.log("structLogs length:    ", trace.structLogs.length);

    // show first 5 lines of format1
    console.log("\nFormat 1 (pc;OPCODE) — first 5 lines:");
    format1.split("\n").slice(0, 5).forEach(line => console.log(" ", line));

    // show first 5 lines of format2
    console.log("\nFormat 2 (pc;OPCODE;args) — first 5 lines:");
    format2.split("\n").slice(0, 5).forEach(line => console.log(" ", line));

    // show format3 summary
    console.log("\nFormat 3 (JSON) — first structLog entry:");
    console.log(" ", JSON.stringify(trace.structLogs[0], null, 2));

    // check files were created
    console.log("\n=== FILES CREATED ===");
    const files = [
        `test-format1.txt`,
        `test-format2.txt`,
        `test-format3.json`
    ];
    files.forEach(f => {
        const fullPath = path.join(outputDir, f);
        const exists = fs.existsSync(fullPath);
        const size = exists ? fs.statSync(fullPath).size : 0;
        console.log(`  ${f}: ${exists ? "✓" : "✗"} (${size} bytes)`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("saveTrace test PASSED");
    console.log("=".repeat(60));
}

main().catch(e => {
    console.error("\nsaveTrace test FAILED:", e.message);
    process.exit(1);
});