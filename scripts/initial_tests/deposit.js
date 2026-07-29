const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [, victim1, victim2] = await ethers.getSigners();

    console.log("=".repeat(60));
    console.log("DEPOSIT");
    console.log("=".repeat(60));

    // ── Load deployment addresses ──────────────────────────
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment.json not found. Run deploy.js first.");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const bankAddress = deployment.contracts.VulnerableBank.address;
    console.log("\n    VulnerableBank address:", bankAddress);

    // ── Connect to deployed contract ───────────────────────
    const VulnerableBank = await ethers.getContractFactory("VulnerableBank");
    const bank = VulnerableBank.attach(bankAddress);

    // ── Balances before ────────────────────────────────────
    console.log("\n[1] Balances before deposit:");
    console.log("    Bank balance :", ethers.formatEther(
        await bank.getBalance()), "ETH");
    console.log("    victim1 balance in bank:", ethers.formatEther(
        await bank.balances(victim1.address)), "ETH");
    console.log("    victim2 balance in bank:", ethers.formatEther(
        await bank.balances(victim2.address)), "ETH");

    // ── victim1 deposits 3 ETH ─────────────────────────────
    console.log("\n[2] victim1 depositing 3 ETH...");
    const tx1 = await bank.connect(victim1).deposit({
        value: ethers.parseEther("3")
    });
    await tx1.wait();
    console.log("    Transaction hash:", tx1.hash);
    console.log("    victim1 balance in bank:", ethers.formatEther(
        await bank.balances(victim1.address)), "ETH");

    // ── victim2 deposits 2 ETH ─────────────────────────────
    console.log("\n[3] victim2 depositing 2 ETH...");
    const tx2 = await bank.connect(victim2).deposit({
        value: ethers.parseEther("2")
    });
    await tx2.wait();
    console.log("    Transaction hash:", tx2.hash);
    console.log("    victim2 balance in bank:", ethers.formatEther(
        await bank.balances(victim2.address)), "ETH");

    // ── Balances after ─────────────────────────────────────
    console.log("\n[4] Balances after deposit:");
    console.log("    Bank balance :", ethers.formatEther(
        await bank.getBalance()), "ETH");
    console.log("    victim1 balance in bank:", ethers.formatEther(
        await bank.balances(victim1.address)), "ETH");
    console.log("    victim2 balance in bank:", ethers.formatEther(
        await bank.balances(victim2.address)), "ETH");
}

main().catch(console.error);