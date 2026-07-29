const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    const [owner, , , attackerEOA] = await ethers.getSigners();

    console.log("=".repeat(60));
    console.log("DEPLOYMENT");
    console.log("=".repeat(60));

    // ── Deploy VulnerableBank ──────────────────────────────
    console.log("\n[1] Deploying VulnerableBank...");
    const VulnerableBank = await ethers.getContractFactory("VulnerableBank");
    const bank = await VulnerableBank.connect(owner).deploy();
    await bank.waitForDeployment();
    const bankAddress = await bank.getAddress();
    console.log("    Deployer :", owner.address);
    console.log("    Address  :", bankAddress);

    // ── Deploy Attacker ────────────────────────────────────
    console.log("\n[2] Deploying Attacker...");
    const Attacker = await ethers.getContractFactory("Attacker");
    const attacker = await Attacker.connect(attackerEOA).deploy(bankAddress);
    await attacker.waitForDeployment();
    const attackerAddress = await attacker.getAddress();
    console.log("    Deployer :", attackerEOA.address);
    console.log("    Address  :", attackerAddress);

    // ── Save addresses ─────────────────────────────────────
    const deployment = {
        network: "hardhat",
        timestamp: new Date().toISOString(),
        contracts: {
            VulnerableBank: {
                address: bankAddress,
                deployer: owner.address
            },
            Attacker: {
                address: attackerAddress,
                deployer: attackerEOA.address
            }
        }
    };

    fs.writeFileSync(
        "deployment.json",
        JSON.stringify(deployment, null, 2)
    );

    console.log("\n[3] Deployment summary:");
    console.log("    VulnerableBank :", bankAddress);
    console.log("    Attacker       :", attackerAddress);
    console.log("    Saved to       : deployment.json");
    console.log("=".repeat(60));
}

main().catch(console.error);