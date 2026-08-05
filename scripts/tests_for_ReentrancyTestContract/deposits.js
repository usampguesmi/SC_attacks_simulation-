const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const artifact = require("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json");
async function main() {

const deploymentPath = path.join(__dirname, "../deployment", "deployment_localhost.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment_localhost.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

const attackerAddress = deployment.contracts.Attacker.address;
const signers = await ethers.getSigners();
const contract = new ethers.Contract (attackerAddress, artifact.abi, signers[0])

// Get contract balance before the transaction
const balanceContract1 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 1 :", balanceContract1);
const senderAddress = await signers[0].getAddress();
const senderBalance1 = await ethers.provider.getBalance(senderAddress);
console.log("Sender:", senderAddress);
console.log("Sender balance 1:", ethers.formatEther(senderBalance1), "ETH");
const balancesmap1 = await contract.balances(senderAddress);
console.log("sender balancesmap1:",balancesmap1.toString());

const callData = contract.interface.encodeFunctionData("deposit");
const tx = await signers[0].sendTransaction({
    to: reentrancyTestAddress,
    data: callData,
   value: ethers.parseEther("0.00001")
});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);

// Get contract balance after the transaction
const balanceContract2 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 2 :", balanceContract2);
const senderBalance2 = await ethers.provider.getBalance(senderAddress);
console.log("Sender balance 2:", ethers.formatEther(senderBalance2), "ETH");
const balancesmap2 = await contract.balances(senderAddress);
console.log("sender balancesmap2",balancesmap2.toString());
}
main().catch(console.error);