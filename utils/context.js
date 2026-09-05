const {ethers}= require ("hardhat");
const fs = require ("fs");
const path = require ("path");


const artifact_attacker= require ("../artifacts/contracts/Attacker.sol/Attacker.json")
const artifact_ReentrancyTest= require ("../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json")
const artifact_VulnerableBank= require ("../artifacts/contracts/VulnerableBank.sol/VulnerableBank.json")
const artifact_Attacker2= require ("../artifacts/contracts/attacker0-N.sol/Attacker2.json")
const artifact_ContractA= require ("../artifacts/contracts/ContractA.sol/ContractA.json")
const artifact_Attacker_drainAll= require ("../artifacts/contracts/attacker-drainAll.sol/Attacker_drainAll.json")


async function loadContext() {
const context ={};
const deploymentPath = path.join(__dirname, "../scripts/deployment/", "deployment_sepolia.json");
    if (!fs.existsSync(deploymentPath)) {
            throw new Error("deployment_sepolia.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

const attackerAddress = deployment.contracts.Attacker.address;
const reentrancyTestAddress = deployment.contracts.ReentrancyTest.address;
const VulnerableBankAddress = deployment.contracts.VulnerableBank.address;
const Attacker2Address = deployment.contracts.Attacker2.address;
const Attacker_drainAllAddress = deployment.contracts.Attacker_drainAll.address;
const ContractAAddress = deployment.contracts.ContractA.address;
const signers  = await ethers.getSigners();
const signer   = signers[0];
const user1    = signers[1]  || null;
const user2    = signers[2]  || null;
const user3    = signers[3]  || null;
const user4    = signers[4]  || null;
const user5    = signers[5]  || null;
const user6    = signers[6]  || null;
const attacker = signers[7]  || null;

const contractAttacker = new ethers.Contract (
    attackerAddress,
    artifact_attacker.abi,
    signer
);
const contractReentrancyTest = new ethers.Contract (
    reentrancyTestAddress,
    artifact_ReentrancyTest.abi,
    signer
);

const contractVulnerableBank = new ethers.Contract (
    VulnerableBankAddress,
    artifact_VulnerableBank.abi,
    signer
);

const contractAttacker_drainAll = new ethers.Contract (
    Attacker_drainAllAddress,
    artifact_Attacker_drainAll.abi,
    signer
);

const contractContractA = new ethers.Contract (
    ContractAAddress,
    artifact_ContractA.abi,
    signer
);

context.deployment = deployment;
context.attackerAddress = attackerAddress;
context.reentrancyTestAddress = reentrancyTestAddress;
context.ContractAAddress = ContractAAddress;
context.signers = signers;
context.contractAttacker = contractAttacker;
context.contractReentrancyTest = contractReentrancyTest;
context.contractContractA = contractContractA;
context.signer = signer;
/*context.user1 = user1;
context.user2 = user2;
context.user3 = user3;
context.user4 = user4;
context.user5 = user5;
context.user6 = user6;
context.attacker = attacker;*/
context.contractVulnerableBank=contractVulnerableBank;
context.contractAttacker_drainAll=contractAttacker_drainAll;
context.Attacker_drainAllAddress=Attacker_drainAllAddress;
context.VulnerableBankAddress=VulnerableBankAddress;


return context
}

module.exports= { loadContext };