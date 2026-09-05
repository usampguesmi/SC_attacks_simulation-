// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// SAFE variant #6: Checks-Effects-Interactions, zero-out style.
// Same idea as BankCEI_Decrement, but the balance is zeroed rather than
// subtracted before the call - the same two lines as the original
// VulnerableBank.withdraw(), just reordered.
contract BankCEI_Zero {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        balances[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
