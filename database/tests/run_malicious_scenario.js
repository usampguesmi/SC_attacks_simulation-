// Parameterized runner for the "single function reentrancy" malicious suite
// (see database/scripts/maliciousScenarios.js for the full mode x multiVictim
// matrix). All 6 scenarios attack the existing VulnerableBank.withdraw()
// through the existing SafeScenario.attackers.vulnerable AttackerConfigurable
// instance - only the attack mode and the pre-attack funding setup vary.
//
// Usage:
//   npx hardhat run database/tests/run_malicious_scenario.js --network sepolia
//     runs ALL 6 scenarios in the manifest, one after another
//   SCENARIO=vulnerable_multiVictim_unlimited npx hardhat run database/tests/run_malicious_scenario.js --network sepolia
//     runs just that one scenario
const path = require("path");
const { ethers } = require("hardhat");
const fs = require("fs");
const { displayState } = require("../../utils/displayState2.js");
const { transaction_reccord_values } = require("../scripts/simulate_transaction.js");
const { getCaseTracePaths } = require("../scripts/tracePaths.js");
const { buildScenarios } = require("../scripts/maliciousScenarios.js");
require("dotenv").config();

const DEPLOYMENT_PATH = path.join(__dirname, "../../scripts/deployment/deployment_sepolia.json");

function loadArtifact(contractName) {
    const p = path.join(__dirname, `../../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function runScenario(scenario, signer, deployment) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Scenario: ${scenario.scenarioKey}  (mode=${scenario.modeKey}, multiVictim=${scenario.multiVictim})`);
    console.log(`${"=".repeat(70)}`);

    const bankAddress = deployment.contracts.MaliciousScenario.bank;
    const attackerAddress = deployment.contracts.MaliciousScenario.attacker;
    const innocentAddress = deployment.contracts.MaliciousScenario.innocentDepositor;

    const bankArtifact = loadArtifact("VulnerableBank");
    const attackerArtifact = loadArtifact("AttackerConfigurable");
    const innocentArtifact = loadArtifact("InnocentDepositor");

    const bank = new ethers.Contract(bankAddress, bankArtifact.abi, signer);
    const attacker = new ethers.Contract(attackerAddress, attackerArtifact.abi, signer);
    const innocent = new ethers.Contract(innocentAddress, innocentArtifact.abi, signer);

    const innocentBalanceMapping = await bank.balances(innocentAddress);
    await displayState("Before Scenario", [
        { name: "Victim bank", address: bankAddress },
        { name: "Attacker", address: attackerAddress, notes: `mode: ${await attacker.mode()}, attackCount: ${await attacker.attackCount()}` },
        { name: "Innocent depositor", address: innocentAddress, notes: `balances[innocent]: ${ethers.formatEther(innocentBalanceMapping)} ETH` },
        { name: "Signer", address: signer.address }
    ]);

    // 1. Configure the attacker's mode for this run.
    const setModeTx = await attacker.setMode(scenario.mode, scenario.maxAttempts);
    await setModeTx.wait();

    // 2. Fund the bank: signer's own baseline deposit, plus (for multiVictim
    // scenarios) a separate third-party deposit via InnocentDepositor.
    const depositCalldata = bank.interface.encodeFunctionData("deposit");
    const depositTx = await signer.sendTransaction({
        to: bankAddress,
        data: depositCalldata,
        value: ethers.parseEther(scenario.preFundEth)
    });
    await depositTx.wait();
    console.log(`Deposit tx (signer baseline): ${depositTx.hash}`);

    if (scenario.multiVictim) {
        const fundCalldata = innocent.interface.encodeFunctionData("fund");
        const fundTx = await signer.sendTransaction({
            to: innocentAddress,
            data: fundCalldata,
            value: ethers.parseEther(scenario.innocentFundEth)
        });
        await fundTx.wait();
        console.log(`Fund tx (innocent depositor): ${fundTx.hash}`);
    }

    // 3. Fire the attack.
    const attackCalldata = attacker.interface.encodeFunctionData("attack");
    const attackTx = await signer.sendTransaction({
        to: attackerAddress,
        data: attackCalldata,
        value: ethers.parseEther(scenario.attackValueEth),
        gasLimit: scenario.gasLimit
    });
    console.log(`Attack tx: ${attackTx.hash}`);

    let reverted = false;
    try {
        await attackTx.wait();
    } catch (err) {
        reverted = true;
        console.log(`Attack tx REVERTED: ${err.shortMessage || err.message}`);
    }

    // 4. Record it regardless of outcome.
    const { outputDir1, filePrefix1, baseOutputDir, folderName } = getCaseTracePaths("malicious_scenario", scenario.scenarioKey);

    const result = await transaction_reccord_values(
        attackTx.hash,
        "sf_reentrancy",
        "MALICIOUS",
        outputDir1,
        filePrefix1,
        baseOutputDir,
        folderName,
        "ATTACKER",
        "VICTIM",
        scenario.functionName
    );
    console.log("Record result:", result);

    const innocentBalanceMappingAfter = await bank.balances(innocentAddress);
    await displayState("After Scenario", [
        { name: "Victim bank", address: bankAddress },
        { name: "Attacker", address: attackerAddress, notes: `mode: ${await attacker.mode()}, attackCount: ${await attacker.attackCount()}${reverted ? " (attack tx REVERTED)" : ""}` },
        { name: "Innocent depositor", address: innocentAddress, notes: `balances[innocent]: ${ethers.formatEther(innocentBalanceMappingAfter)} ETH (unchanged mapping - real ETH may be gone)` },
        { name: "Signer", address: signer.address }
    ]);

    return { scenarioKey: scenario.scenarioKey, reverted, ...result };
}

async function main() {
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
    if (!deployment.contracts.MaliciousScenario) {
        throw new Error("deployment.contracts.MaliciousScenario not found - run scripts/deployment/deployMaliciousScenario.js first.");
    }

    const [signer] = await ethers.getSigners();
    const scenarios = buildScenarios();

    const requestedKey = process.env.SCENARIO;
    const keysToRun = requestedKey ? [requestedKey] : Object.keys(scenarios);

    const results = [];
    for (const key of keysToRun) {
        const scenario = scenarios[key];
        if (!scenario) {
            throw new Error(`Unknown scenario key "${key}". Available: ${Object.keys(scenarios).join(", ")}`);
        }
        const result = await runScenario(scenario, signer, deployment);
        results.push(result);
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log("All requested scenarios finished.");
    console.table(results.map(r => ({
        scenario: r.scenarioKey,
        reverted: r.reverted,
        mainTxId: r.mainTxId,
        internalCalls: r.internalCallCount
    })));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
