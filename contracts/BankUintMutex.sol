// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// SAFE variant #4: uint256 reentrancy guard (manual reimplementation,
// not the OpenZeppelin import - see BankOZGuard.sol for that).
// Same vulnerable call-before-effects ORDER as BankBoolMutex on purpose;
// only the lock mechanism differs (uint256 status flag vs bool).
contract BankUintMutex {
    mapping(address => uint256) public balances;

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private status = NOT_ENTERED;

    modifier nonReentrant() {
        require(status != ENTERED, "Reentrant call blocked");
        status = ENTERED;
        _;
        status = NOT_ENTERED;
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
