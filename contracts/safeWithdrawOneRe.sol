//SPDK-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SafeWithdrawOneRe {

    mapping (address =>uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] = msg.value;
    }

    function transfer() public {
        payable(msg.sender).call{value:balances[msg.sender]}("");
    }

    function transferWithReturn() public {
        (bool success,)= payable(msg.sender).call{value:balances[msg.sender]}("");
        require (success, "transfer failed");
    }

    function transferWithRequire() public {
        require (balances[msg.sender]>0, "no balance");
        payable(msg.sender).call{value:balances[msg.sender]}("");
    }

    function transaferWithRequireAndReturn() public {
       require (balances[msg.sender]>0, "no balance");
       (bool success,)= payable(msg.sender).call{value:balances[msg.sender]}("");
       require (success, "transfer failed");
    }

    function transferUseAmount() public {
        uint256 amount = balances[msg.sender];
        require (amount>0, "no balance");
        (bool success,)= payable(msg.sender).call{value: amount}("");
        require (success, "transfer failed");
    }

    function NoWithdraw()public{

        uint256 amount = balances [msg.sender];
        
        require (amount>0, "no balance");
        
        balances[msg.sender]=0;
    }

    function SafeWithdraw()public payable {

        uint256 amount = balances[msg.sender];

        require (amount > 0 , "no balance");

        balances[msg.sender]=0;

        (bool success,) = payable(msg.sender).call{value:amount}("");

        require (success, "transfer failed");
    }
  

    function UnsafeWithdraw() public {

        uint256 amount = balances[msg.sender];

        require(amount >0 , "no blance");

        (bool success,) =  payable(msg.sender).call{value:amount}("");

        require (success, "transfer failed");

        balances[msg.sender] = 0;
    }
    
}