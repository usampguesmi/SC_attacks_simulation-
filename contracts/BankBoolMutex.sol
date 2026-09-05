// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// SAFE variant #3: boolean reentrancy guard.
// The call-before-effects ORDER is kept exactly as vulnerable as
// VulnerableBank.withdraw() on purpose - the bool lock alone is what
// makes reentry impossible here, not the statement ordering.
contract BankBoolMutex {
    mapping(address => uint256) public balances;

    bool private locked;

    modifier nonReentrant() {
        require(!locked, "Reentrant call blocked");
        locked = true;
        _;
        locked = false;
    }

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
