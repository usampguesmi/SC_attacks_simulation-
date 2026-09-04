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
        require (amount>0, "sender does not have a  balance"); 
        require (address(this).balance>=amount, "balance contract not enough"); 
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer balance to sender failed ");
    }
    function secondRequireinst()public{
        uint256 amount = balances [msg.sender];
        require (amount>0, "no balance"); 
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer failed");
    }

    function withdraw(uint256 amount) public {
        require(address(this).balance >= amount, "balance contract less than requested amount");
        (bool success,) = payable(msg.sender).call{value:amount}("");
        require (success, "transfer amount to sender failed"); 
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
        require (success, "transfer of amount failed");
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

        require (success, "transfer of amount failed");
        
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

    bool private locked;

modifier nonReentrant() {
    require(!locked, "reentrant call");
    locked = true;
    _;
    locked = false;
}

function withdrawGuarded() public nonReentrant {
    uint256 amount = balances[msg.sender];
    require(amount > 0, "no balance");
    (bool success,) = payable(msg.sender).call{value: amount}("");
    require(success, "transfer failed");
    balances[msg.sender] = 0;
}
}