const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const artifact = require("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json");
async function main() {
const deploymentPath = path.join(__dirname, "../deployment", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const reentrancyTestAddress = deployment.contracts.ReentrancyTest.address;
const signers = await ethers.getSigners();
const contract = new ethers.Contract (reentrancyTestAddress, artifact.abi, signers[0])
const code = await ethers.provider.getCode(reentrancyTestAddress);

// Get contract balance
const balance = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance :", balance);

 // Invoke the getter
const balance = await contract.getBalanceOfsender();
console.log("Recorded balance:", balance.toString());


}
main().catch(console.error);