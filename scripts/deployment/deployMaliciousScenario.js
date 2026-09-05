// Deploys the one new contract the "single function reentrancy" malicious
// suite needs: InnocentDepositor, pointed at the existing VulnerableBank.
// The attacker used throughout is the SafeScenario.attackers.vulnerable
// AttackerConfigurable instance already deployed against VulnerableBank -
// no need to redeploy that.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deploymentPath = path.join(__dirname, "deployment_sepolia.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    const [signer] = await ethers.getSigners();
    const bankAddress = deployment.contracts.VulnerableBank.address;

    const Factory = await ethers.getContractFactory("InnocentDepositor");
    const innocent = await Factory.connect(signer).deploy(bankAddress);
    await innocent.waitForDeployment();
    const innocentAddress = await innocent.getAddress();
    console.log(`Deployed InnocentDepositor at ${innocentAddress} (target ${bankAddress})`);

    deployment.contracts.MaliciousScenario = deployment.contracts.MaliciousScenario || {};
    deployment.contracts.MaliciousScenario.bank = bankAddress;
    deployment.contracts.MaliciousScenario.attacker = deployment.contracts.SafeScenario.attackers.vulnerable;
    deployment.contracts.MaliciousScenario.innocentDepositor = innocentAddress;

    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log("Deployment file updated.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
