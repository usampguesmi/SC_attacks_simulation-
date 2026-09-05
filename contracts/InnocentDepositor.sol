// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IBank {
    function deposit() external payable;
    function withdraw() external;
}

// A perfectly ordinary depositor - no reentrancy, no malicious logic.
// Used to fund the vulnerable bank with a THIRD PARTY's real balance before
// an attack, so a drain provably steals someone else's money rather than
// just cycling the attacker's own deposit. attemptWithdraw() lets this
// party try to withdraw its own recorded balance afterwards, to show the
// funds are actually gone even though balances[this] still reads nonzero.
contract InnocentDepositor {
    IBank public immutable target;

    constructor(address _target) {
        target = IBank(_target);
    }

    function fund() external payable {
        target.deposit{value: msg.value}();
    }

    function attemptWithdraw() external {
        target.withdraw();
    }

    receive() external payable {}
}
