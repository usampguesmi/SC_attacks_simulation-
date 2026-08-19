const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {loadContext} = require ("../Single_function_reentrancy/context.js");
const { displayState } = require("../../utils/displayState");

async function main() {
   
    const ctx = await loadContext();
    const {signer, attackerAddress, reentrancyTestAddress, contractReentrancyTest, contractAttacker } = ctx;
    await displayState(
    "BEFORE ATTACK",
    reentrancyTestAddress,
    attackerAddress,
    contractReentrancyTest,
    contractAttacker,
    signer
    
);
   

    /*
    for (let i=0; i<=7;i++){
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
    }*/
}

main().catch(console.error);