// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// SAFE variant #2: Checks-Effects-Interactions, decrement style.
// State is updated (subtracted) BEFORE the external call, so a reentrant
// call sees balances[msg.sender] already reduced and withdraws nothing extra.
contract BankCEI_Decrement {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        balances[msg.sender] -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
