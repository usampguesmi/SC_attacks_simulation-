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
   
   /* const attackerContract_Balance = await ethers.provider.getBalance(attackerAddress);

    console.log("Attacker contract balance = ", ethers.formatEther(attackerContract_Balance),"ETH");
    console.log("reentrancyTest contract balance: =", ethers.formatEther(await ethers.provider.getBalance(reentrancyTestAddress)),"ETH");
    console.log("attacker user balance =  ", ethers.formatEther(await ethers.provider.getBalance(signer.address)),"ETH");

    const balancesmapping1 = await contractReentrancyTest.balances(signer.address);
    console.log("balances attacker user in reentrancy contract = ",ethers.formatEther(balancesmapping1),"ETH");

const contractAttacker = new ethers.Contract (
    attackerAddress,
    artifact_attcker.abi,
    signer
);

console.log((await contractAttacker.attackCount()).toString()," attackCount in attacker contract");

    /*
    for (let i=0; i<=7;i++){
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
    }*/
}

main().catch(console.error);