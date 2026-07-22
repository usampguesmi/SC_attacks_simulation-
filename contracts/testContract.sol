pragma solidity ^0.8.19;

contract testContract {
    uint256 public balance;
    uint256 public value;
    mapping (address=>uint256) public map;


    function getBalance() public view returns (uint256) {
        return balance;
    }

    function deposit() public payable{
        balance +=msg.value;
    }

    function getValue() public view returns (uint256)   {
        return value;
    }
     
    function setValue (uint256 _value) public {
        value = _value;
    }
    function setValue2 (uint256 _value) public {
        value+= _value;
    }
     function setValue3 (uint256 _value) public {
        value-= _value;
    }
    function setValueWithCondition1 (uint256 _value) public {
        if (_value>3){
        value = _value;}
        else{
            value = 0;
        }
    }

     function setValueWithCondition2 (uint256 _value) public {
        if (_value>3){
        value = _value;}
        else{
           return;
    }}

    function getBalanceOfContract() public view returns (uint256){
        return address(this).balance;
    }

    function checkMap() public view returns (uint256) {
       return map[msg.sender];
    }

    function updateMap() public payable {
        map[msg.sender] = msg.value;
    }

    function updateMapWithRequire () public payable{
        require (msg.value>0, "value must be greater than 0");
        map[msg.sender]+=msg.value;
    }
     function updateMapWithto0 () public payable{
        map[msg.sender]=0;
    }
   function updateMapto0WithRequire() public payable {
    require(msg.value<1 ether, "value must be less that 1 ether");
    map[msg.sender]=0;
   }
}