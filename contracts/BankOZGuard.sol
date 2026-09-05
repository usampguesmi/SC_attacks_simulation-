// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// SAFE variant #5: OpenZeppelin's ReentrancyGuard (library import, not a
// hand-rolled lock). Internally OZ also uses a uint256 status flag, so
// this is a useful comparison point against BankUintMutex's manual version.
// Same vulnerable call-before-effects ORDER kept on purpose.
contract BankOZGuard is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] = 0;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
