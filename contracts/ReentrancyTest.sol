//SPDK-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ReentrancyTest {

    mapping (address =>uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] = msg.value;
    }

    function getBalanceOfsender() public view returns (uint256) {
       return balances[msg.sender];
    }

    function callTransfer() public {
        payable(msg.sender).call{value:balances[msg.sender]}("");
    }

    function callTransferAndUpdateState() public {
        payable(msg.sender).call{value:balances[msg.sender]}("");
        balances[msg.sender] = 0;
    }

    function callTransferWithRequire() public {
        (bool success,)= payable(msg.sender).call{value:balances[msg.sender]}("");
        require (success, "transfer failed");
    }

    function callTransferWith2Requires() public {
        require (balances[msg.sender]>0, "no balance");
        (bool success,)= payable(msg.sender).call{value:balances[msg.sender]}("");
        require (success, "transfer failed");
    }

    function callTransferWith2RequiresplusState() public {
       require (balances[msg.sender]>0, "no balance");
       (bool success,)= payable(msg.sender).call{value:balances[msg.sender]}("");
       require (success, "transfer failed");
       balances[msg.sender] = 0;
    }
    
    function callTransferUseAmount() public {
        uint256 amount = balances[msg.sender];
        require (amount>0, "no balance");
        (bool success,)= payable(msg.sender).call{value: amount}("");
        require (success, "transfer failed");
    }

//withdraw fuctions line by line 
    function amountinst()public{
        uint256 amount = balances [msg.sender];
    }
     function requireinst()public{
        require (balances [msg.sender]>0, "no balance");
    }
    function amountrequireinst()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
    }
     function callinst()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
        (bool success,) = payable(msg.sender).call{value:amount}("");
    }
    function secondRequireinst()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer failed");
    }

    function safewithdraw()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
        balances[msg.sender]=0;
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer failed"); 
    }

    function unsafewithdraw()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer failed");
        balances[msg.sender]=0; 
    }

    function NoWithdraw()public{

        uint256 amount = balances [msg.sender];
        
        require (amount>0, "no balance");
        
        balances[msg.sender]=0;
    }

    function WithdrawWithoutUpdatingState()public{

        uint256 amount = balances [msg.sender];
        
        require (amount>0, "no balance");

        (bool success,) = payable(msg.sender).call{value:amount}("");

        require (success, "transfer failed");
        
    }
}