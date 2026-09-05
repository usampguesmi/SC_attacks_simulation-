// Manifest for the "single function reentrancy" malicious suite - all
// scenarios attack the SAME vulnerable withdraw() (VulnerableBank.sol) with
// the SAME AttackerConfigurable contract already deployed for it in the
// safe-scenario suite (SafeScenario.attackers.vulnerable). Only the attack
// mode and the pre-attack funding setup vary; no new function or contract
// is targeted (that's what makes these "single function" cases, as opposed
// to cross-function/cross-contract/token-hook variants).
//
// multiVictim: false -> only the attacker's own deposit sits in the bank
//              (cycling its own money, same as the earlier ad-hoc scripts)
// multiVictim: true  -> a separate InnocentDepositor funds the bank first,
//              so a successful drain provably eats into a third party's
//              recorded balance, not just the attacker's own deposit

const MODES = {
    single:    { mode: 1, maxAttempts: 0 },
    multiple:  { mode: 2, maxAttempts: 3 },
    unlimited: { mode: 3, maxAttempts: 0 }
};

const PRE_FUND_ETH = "0.0001";        // signer's own baseline deposit (present in every case)
const INNOCENT_FUND_ETH = "0.0001";   // third-party deposit, only for multiVictim cases
const ATTACK_VALUE_ETH = "0.00002";   // msg.value sent to attack() - this run's depositAmount
const ATTACK_GAS_LIMIT = 500000;

function buildScenarios() {
    const scenarios = {};
    for (const multiVictim of [false, true]) {
        for (const [modeKey, modeCfg] of Object.entries(MODES)) {
            const scenarioKey = multiVictim ? `vulnerable_multiVictim_${modeKey}` : `vulnerable_${modeKey}`;
            scenarios[scenarioKey] = {
                scenarioKey,
                modeKey,
                mode: modeCfg.mode,
                maxAttempts: modeCfg.maxAttempts,
                multiVictim,
                functionName: `malicious_${scenarioKey}`,
                preFundEth: PRE_FUND_ETH,
                innocentFundEth: multiVictim ? INNOCENT_FUND_ETH : null,
                attackValueEth: ATTACK_VALUE_ETH,
                gasLimit: ATTACK_GAS_LIMIT
            };
        }
    }
    return scenarios;
}

module.exports = { MODES, buildScenarios, PRE_FUND_ETH, INNOCENT_FUND_ETH, ATTACK_VALUE_ETH, ATTACK_GAS_LIMIT };
