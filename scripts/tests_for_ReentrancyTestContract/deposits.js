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

// Get contract balance before the transaction
const balanceContract1 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 1 :",  ethers.formatEther(balanceContract1));
const balanceaccount1 = await ethers.provider.getBalance(signers[0].address);
console.log("sender balance 1:",  ethers.formatEther(balanceaccount1).toString());

const callData = contract.interface.encodeFunctionData("deposit");
const tx = await signers[0].sendTransaction({
    to: reentrancyTestAddress,
    data: callData,
   value: ethers.parseEther("0.00000001")
});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);

// Get contract balance after the transaction
const balanceContract2 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 2 :",  ethers.formatEther(balanceContract2));
// Invoke the balances[msg.sender] after the transaction
const balanceaccount2 = await ethers.provider.getBalance(signers[0].address);
console.log("sender balance 2:",  ethers.formatEther(balanceaccount2).toString());

}
main().catch(console.error);