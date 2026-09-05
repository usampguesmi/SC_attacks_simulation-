// Parameterized runner for the "safe scenario" test suite (see
// database/scripts/safeScenarios.js for the full victim x mode matrix).
//
// Usage:
//   npx hardhat run database/tests/run_safe_scenario.js --network sepolia
//     runs ALL scenarios in the manifest, one after another
//   SCENARIO=ceiDecrement_single npx hardhat run database/tests/run_safe_scenario.js --network sepolia
//     runs just that one scenario
//
// For each scenario this: (1) sets the attacker's mode, (2) deposits real
// pre-existing funds into the bank, (3) sends the attack() transaction with
// an explicit gas limit, (4) records it via transaction_reccord_values
// (works whether the tx succeeded or reverted), (5) prints before/after state.
const path = require("path");
const { ethers } = require("hardhat");
const fs = require("fs");
const { displayState } = require("../../utils/displayState2.js");
const { transaction_reccord_values } = require("../scripts/simulate_transaction.js");
const { getCaseTracePaths } = require("../scripts/tracePaths.js");
const { buildScenarios } = require("../scripts/safeScenarios.js");
require("dotenv").config();

const DEPLOYMENT_PATH = path.join(__dirname, "../../scripts/deployment/deployment_sepolia.json");

function loadArtifact(contractName) {
    const p = path.join(__dirname, `../../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function runScenario(scenario, signer, deployment) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Scenario: ${scenario.scenarioKey}  (mode=${scenario.modeKey}, purpose=${scenario.transactionPurpose})`);
    console.log(`${"=".repeat(70)}`);

    const bankAddress = deployment.contracts.SafeScenario.banks[scenario.victimKey];
    const attackerAddress = deployment.contracts.SafeScenario.attackers[scenario.victimKey];

    if (!bankAddress || !attackerAddress) {
        throw new Error(`Missing deployed address for victimKey "${scenario.victimKey}" - run deploySafeScenario.js first.`);
    }

    const bankArtifact = loadArtifact(scenario.contractName);
    const attackerArtifact = loadArtifact("AttackerConfigurable");

    const bank = new ethers.Contract(bankAddress, bankArtifact.abi, signer);
    const attacker = new ethers.Contract(attackerAddress, attackerArtifact.abi, signer);

    const modeBefore = await attacker.mode();
    const attackCountBefore = await attacker.attackCount();
    await displayState("Before Scenario", [
        { name: "Victim bank", address: bankAddress },
        { name: "Attacker", address: attackerAddress, notes: `mode: ${modeBefore}, attackCount: ${attackCountBefore}` },
        { name: "Signer", address: signer.address }
    ]);

    // 1. Configure the attacker's mode for this run.
    const setModeTx = await attacker.setMode(scenario.mode, scenario.maxAttempts);
    await setModeTx.wait();

    // 2. Fund the bank with real pre-existing balance for the attack to target.
    const depositCalldata = bank.interface.encodeFunctionData("deposit");
    const depositTx = await signer.sendTransaction({
        to: bankAddress,
        data: depositCalldata,
        value: ethers.parseEther(scenario.preFundEth)
    });
    await depositTx.wait();
    console.log(`Deposit tx: ${depositTx.hash}`);

    // 3. Fire the attack. A revert here is EXPECTED for protected banks under
    // an actual attack mode (see safeScenarios.js) - still record it.
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
        console.log(`Attack tx REVERTED (this is the expected defended outcome for protected banks under an attack mode): ${err.shortMessage || err.message}`);
    }

    // 4. Record it regardless of outcome - the trace of a blocked attempt matters too.
    const { outputDir1, filePrefix1, baseOutputDir, folderName } = getCaseTracePaths("safe_scenario", scenario.scenarioKey);

    const result = await transaction_reccord_values(
        attackTx.hash,
        "sf_reentrancy",
        scenario.transactionPurpose,
        outputDir1,
        filePrefix1,
        baseOutputDir,
        folderName,
        "ATTACKER",
        "VICTIM",
        scenario.functionName
    );
    console.log("Record result:", result);

    const modeAfter = await attacker.mode();
    const attackCountAfter = await attacker.attackCount();
    await displayState("After Scenario", [
        { name: "Victim bank", address: bankAddress },
        { name: "Attacker", address: attackerAddress, notes: `mode: ${modeAfter}, attackCount: ${attackCountAfter}${reverted ? " (attack tx REVERTED)" : ""}` },
        { name: "Signer", address: signer.address }
    ]);

    return { scenarioKey: scenario.scenarioKey, reverted, ...result };
}

async function main() {
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
    if (!deployment.contracts.SafeScenario) {
        throw new Error("deployment.contracts.SafeScenario not found - run scripts/deployment/deploySafeScenario.js first.");
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
