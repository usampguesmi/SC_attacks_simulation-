const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const artifact_ReentrancyTest = require(
    "../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json"
);

async function main() {
    const deploymentPath = path.join(
        __dirname,
        "../deployment",
        "deployment_localhost.json"
    );

    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment.json not found. Run deploy.js first.");
    }

    const deployment = JSON.parse(
        fs.readFileSync(deploymentPath, "utf8")
    );

    const attackerAddress= deployment.contracts.Attacker.address;
    const reentrancyTestAddress= deployment.contracts.ReentrancyTest.address;
    const signers = await ethers.getSigners();
    const signer = signers[0];
    const  user1 = signers[1];
    const  user2 = signers[2];
    const  user3 = signers[3];
    const  user4 = signers[4];
    const  user5 = signers[5];
    const  user6 = signers[6];
    const  attacker = signers[7];

    const contractReentrancyTest = new ethers.Contract (
    reentrancyTestAddress,
    artifact_ReentrancyTest.abi,
    signer
);
    const attackerContract_Balance = await ethers.provider.getBalance(attackerAddress);
    console.log("Attacker contract balance = ", ethers.formatEther(attackerContract_Balance),"ETH");
    console.log("reentrancyTest contract balance: =", ethers.formatEther(await ethers.provider.getBalance(reentrancyTestAddress)),"ETH");
    console.log("attacker user balance =  ",ethers.formatEther(await  ethers.provider.getBalance(attacker.address)),"ETH");

    const balancesmapping1 = await contractReentrancyTest.balances(attacker.address);
    console.log("balances attacker user in reentrancy contract = ",ethers.formatEther(balancesmapping1),"ETH");


    /*
    for (let i=0; i<=7;i++){
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
    }*/
}

main().catch(console.error);