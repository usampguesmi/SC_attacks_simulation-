// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./contractB.sol";

contract ContractA {
    address public lastDeployedB;

    event BDeployed(address indexed bAddress);

    function deployB() external returns (address) {
        ContractB b = new ContractB();
        lastDeployedB = address(b);
        emit BDeployed(address(b));
        return address(b);
    }
}