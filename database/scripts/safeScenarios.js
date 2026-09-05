// Manifest of every (victim contract x attack mode) combination in the
// "safe scenario" test suite. One entry = one scenario key, run via
// `node database/tests/run_safe_scenario.js <scenarioKey>` (or `all`).
//
// Victim contracts (case numbers match the original request):
//   1. vulnerable    - VulnerableBank.sol, the original call-before-effects bank
//                      (reused as-is; only ever run with mode "noAttack" here -
//                      running it under an actual attack just reproduces the
//                      malicious_scenario dataset already collected earlier)
//   2. ceiDecrement  - BankCEI_Decrement.sol   (state -= amount before call)
//   3. boolMutex     - BankBoolMutex.sol       (bool reentrancy guard)
//   4. uintMutex     - BankUintMutex.sol       (uint256 reentrancy guard, manual)
//   5. ozGuard       - BankOZGuard.sol         (OpenZeppelin ReentrancyGuard)
//   6. ceiZero       - BankCEI_Zero.sol        (state = 0 before call)
//   7. fullBalance   - BankFullBalanceWithdraw.sol (sends whole balance, 1 call)
//
// Attack modes (AttackerConfigurable.mode):
//   0 noAttack         - receive() never reenters (legitimate single withdrawal)
//   1 single            - receive() reenters exactly once
//   2 multiple           - receive() reenters up to maxAttempts times
//   3 unlimited          - receive() reenters as long as the bank can cover it
//
// NOTE ON EXPECTED OUTCOMES: for cases 2-6 (CEI / mutex protected), modes
// 1-3 are expected to REVERT THE WHOLE attack() TRANSACTION - every
// withdraw() in this suite reverts on failure, and a blocked reentrant
// call cascades that revert back up through every require(success) in the
// call chain. That's the correct defended outcome, not a bug; the trace of
// a reverted attempt is itself useful data. Case 7 is the exception: its
// single-call full-balance withdraw means modes 1-3 behave identically to
// noAttack (nothing left to reenter for), so it should always SUCCEED.

const MODES = {
    noAttack:  { mode: 0, maxAttempts: 0, purpose: "BENIGN" },
    single:    { mode: 1, maxAttempts: 0, purpose: "MALICIOUS" },
    multiple:  { mode: 2, maxAttempts: 3, purpose: "MALICIOUS" },
    unlimited: { mode: 3, maxAttempts: 0, purpose: "MALICIOUS" }
};

// victimKey -> { contractName (matches contracts/<name>.sol), modesToRun }
const VICTIMS = {
    vulnerable:  { contractName: "VulnerableBank",            modesToRun: ["noAttack"] },
    ceiDecrement:{ contractName: "BankCEI_Decrement",         modesToRun: ["noAttack", "single", "multiple", "unlimited"] },
    boolMutex:   { contractName: "BankBoolMutex",             modesToRun: ["noAttack", "single", "multiple", "unlimited"] },
    uintMutex:   { contractName: "BankUintMutex",              modesToRun: ["noAttack", "single", "multiple", "unlimited"] },
    ozGuard:     { contractName: "BankOZGuard",               modesToRun: ["noAttack", "single", "multiple", "unlimited"] },
    ceiZero:     { contractName: "BankCEI_Zero",               modesToRun: ["noAttack", "single", "multiple", "unlimited"] },
    fullBalance: { contractName: "BankFullBalanceWithdraw",   modesToRun: ["noAttack", "single", "multiple", "unlimited"] }
};

const PRE_FUND_ETH = "0.0001";   // deposited straight into the bank before the attack, real pre-existing funds
const ATTACK_VALUE_ETH = "0.00002"; // msg.value sent to attack() - this run's depositAmount
const ATTACK_GAS_LIMIT = 500000;    // don't rely on eth_estimateGas for reentrant call chains

function buildScenarios() {
    const scenarios = {};
    for (const [victimKey, victimCfg] of Object.entries(VICTIMS)) {
        for (const modeKey of victimCfg.modesToRun) {
            const modeCfg = MODES[modeKey];
            const scenarioKey = `${victimKey}_${modeKey}`;
            scenarios[scenarioKey] = {
                scenarioKey,
                victimKey,
                contractName: victimCfg.contractName,
                modeKey,
                mode: modeCfg.mode,
                maxAttempts: modeCfg.maxAttempts,
                transactionPurpose: modeCfg.purpose,
                functionName: `safe_${scenarioKey}`,
                preFundEth: PRE_FUND_ETH,
                attackValueEth: ATTACK_VALUE_ETH,
                gasLimit: ATTACK_GAS_LIMIT
            };
        }
    }
    return scenarios;
}

module.exports = { MODES, VICTIMS, buildScenarios, PRE_FUND_ETH, ATTACK_VALUE_ETH, ATTACK_GAS_LIMIT };
