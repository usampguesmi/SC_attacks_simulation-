// Deploys the 6 new "safe scenario" victim banks + one AttackerConfigurable
// instance per victim (including one pointed at the existing VulnerableBank,
// for the case-1 baseline). Addresses are written into deployment_sepolia.json
// under contracts.SafeScenario, keyed by the same victim keys the test
// runner / scenario manifest use.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// victimKey -> Solidity contract name (also the file name, contracts/<name>.sol)
const VICTIM_CONTRACTS = {
    vulnerable: "VulnerableBank",       // case 1 - reused, not redeployed here
    ceiDecrement: "BankCEI_Decrement",  // case 2
    boolMutex: "BankBoolMutex",         // case 3
    uintMutex: "BankUintMutex",         // case 4
    ozGuard: "BankOZGuard",             // case 5
    ceiZero: "BankCEI_Zero",            // case 6
    fullBalance: "BankFullBalanceWithdraw" // case 7
};

async function main() {
    const deploymentPath = path.join(__dirname, "deployment_sepolia.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    const [signer] = await ethers.getSigners();

    deployment.contracts.SafeScenario = deployment.contracts.SafeScenario || { banks: {}, attackers: {} };

    // case 1 reuses the already-deployed VulnerableBank - no redeploy.
    deployment.contracts.SafeScenario.banks.vulnerable = deployment.contracts.VulnerableBank.address;

    for (const [victimKey, contractName] of Object.entries(VICTIM_CONTRACTS)) {
        if (victimKey === "vulnerable") continue;

        const Factory = await ethers.getContractFactory(contractName);
        const bank = await Factory.connect(signer).deploy();
        await bank.waitForDeployment();
        const bankAddress = await bank.getAddress();
        deployment.contracts.SafeScenario.banks[victimKey] = bankAddress;
        console.log(`Deployed ${contractName} (${victimKey}) at ${bankAddress}`);
    }

    const AttackerFactory = await ethers.getContractFactory("AttackerConfigurable");
    for (const victimKey of Object.keys(VICTIM_CONTRACTS)) {
        const bankAddress = deployment.contracts.SafeScenario.banks[victimKey];
        const attacker = await AttackerFactory.connect(signer).deploy(bankAddress);
        await attacker.waitForDeployment();
        const attackerAddress = await attacker.getAddress();
        deployment.contracts.SafeScenario.attackers[victimKey] = attackerAddress;
        console.log(`Deployed AttackerConfigurable for ${victimKey} at ${attackerAddress} (target ${bankAddress})`);
    }

    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log("Deployment file updated.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
