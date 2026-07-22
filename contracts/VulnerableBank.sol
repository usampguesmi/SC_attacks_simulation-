// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    // deposit ETH
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // VULNERABLE: sends ETH before updating balance
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        // CALL happens BEFORE SSTORE — vulnerability
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        // SSTORE happens AFTER CALL — too late
        balances[msg.sender] = 0;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}