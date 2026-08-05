const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const artifact_ReentrancyTest_Contract = require(
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
    const contractReentrancyTest = new ethers.Contract (
       reentrancyTestAddress,
       artifact_ReentrancyTest_Contract.abi,
       signers[0]
    );

    const contractBalance = await ethers.provider.getBalance(attackerAddress);
    console.log("Attacker contract address:", attackerAddress);
    console.log("Attacker contract balance:", ethers.formatEther(contractBalance));
    
    console.log("signers[0] address:", signers[0].address);
    console.log("balance of signer[0]:  ",ethers.formatEther(await  ethers.provider.getBalance(signers[0].address)), "ETHER ");

    const balancesmapping1 = await contractReentrancyTest.balances(signers[0].address);
    console.log("balances[sender] in ETH:",ethers.formatEther(balancesmapping1),"ETH");


    const signer = signers[0];
    const  user1 = signers[1];
    const  user2 = signers[2];
    const  user3 = signers[3];
    const  user4 = signers[4];
    const  user5 = signers[5];
    const  user6 = signers[6];
    const  attacker = signers[7];

    for (let i=0; i<=7;i++){
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
    }
}

main().catch(console.error);