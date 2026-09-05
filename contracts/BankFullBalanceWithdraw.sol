// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// SAFE variant #7: withdraw() sends the ENTIRE contract balance in one
// call, ignoring per-user accounting entirely - not "safe" by design intent,
// but not amplifiable via reentrancy either: after the first successful
// send, address(this).balance is already 0, so any reentrant call finds
// nothing left and reverts on its own require(amount > 0). Useful as a
// negative control: it "sends ETH via an external call" just like the
// vulnerable contract, but reentrancy doesn't make the damage any worse
// than a single legitimate call already would.
contract BankFullBalanceWithdraw {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = address(this).balance;
        require(amount > 0, "Empty");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
