const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {

    console.log("=".repeat(60));
    console.log("OPCODE SEQUENCE TRACE");
    console.log("=".repeat(60));

    // ── Load attack transaction hash ───────────────────────
    const attackPath = path.join(__dirname, "..", "attack.json");
    if (!fs.existsSync(attackPath)) {
        throw new Error("attack.json not found. Run attack.js first.");
    }
    const attackInfo = JSON.parse(fs.readFileSync(attackPath, "utf8"));
    const txHash = attackInfo.transaction.hash;

    console.log("\n    Transaction hash :", txHash);
    console.log("    Fetching trace...");

    // ── Fetch trace ────────────────────────────────────────
    const trace = await ethers.provider.send(
        "debug_traceTransaction",
        [txHash, {
            disableStorage: true,
            disableMemory:  true,
            disableStack:   true
        }]
    );

    const logs = trace.structLogs;
    console.log("    Total opcodes    :", logs.length);

    // ── Build opcode sequence: pc;OPCODE ───────────────────
    let content = "";
    content += "# Reentrancy Attack — Opcode Sequence\n";
    content += "# Transaction: " + txHash + "\n";
    content += "# Format: pc;OPCODE\n";
    content += "# Total opcodes: " + logs.length + "\n";
    content += "#\n";

    logs.forEach(log => {
        content += `${log.pc};${log.op}\n`;
    });

    // ── Save ───────────────────────────────────────────────
    const outPath = path.join(__dirname, "..", "opcodes.txt");
    fs.writeFileSync(outPath, content);

    console.log("    Saved to opcodes.txt");
    console.log("=".repeat(60));
}

main().catch(console.error);