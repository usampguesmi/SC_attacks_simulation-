const {ethers}= require ("hardhat");
const fs = require ("fs");
const path = require ("path");

const artifact_attcker= require ("../../artifacts/contracts/Attacker.sol/Attacker.json")
const artifact_ReentrancyTest= require ("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json")

async function loadContext() {
const context ={};
const deploymentPath = path.join(__dirname, "../deployment", "deployment_localhost.json");
    if (!fs.existsSync(deploymentPath)) {
            throw new Error("deployment_localhost.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

const attackerAddress = deployment.contracts.Attacker.address;
const reentrancyTestAddress = deployment.contracts.ReentrancyTest.address;

const signers = await ethers.getSigners();
const signer = signers[0];
const  user1 = signers[1];
const  user2 = signers[2];
const  user3 = signers[3];
const  user4 = signers[4];
const  user5 = signers[5];
const  user6 = signers[6];
const  attacker = signers[7];

const contractAttacker = new ethers.Contract (
    attackerAddress,
    artifact_attcker.abi,
    signer
);
const contractReentrancyTest = new ethers.Contract (
    reentrancyTestAddress,
    artifact_ReentrancyTest.abi,
    signer
);

    

context.deployment = deployment;
context.attackerAddress = attackerAddress;
context.reentrancyTestAddress = reentrancyTestAddress;
context.signers = signers;
context.contractAttacker = contractAttacker;
context.contractReentrancyTest = contractReentrancyTest;
context.signer = signer;
context.user1 = user1;
context.user2 = user2;
context.user3 = user3;
context.user4 = user4;
context.user5 = user5;
context.user6 = user6;
context.attacker = attacker;

return context
}

module.exports= { loadContext };