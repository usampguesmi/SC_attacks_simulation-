const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const artifact = require(
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

    const reentrancyTestAddress =
        deployment.contracts.ReentrancyTest.address;

    const [signer] = await ethers.getSigners();

    const senderAddress = await signer.getAddress();

    const contract = new ethers.Contract(
        reentrancyTestAddress,
        artifact.abi,
        signer
    );

    console.log("Contract address:", reentrancyTestAddress);
    console.log("Sender address:", senderAddress);

    // Native ETH balance of the contract
    const contractBalance =
        await ethers.provider.getBalance(reentrancyTestAddress);

    console.log(
        "Contract ETH balance:",
        ethers.formatEther(contractBalance),
        "ETH"
    );

    // Native ETH balance of the sender
    const senderBalance =
        await ethers.provider.getBalance(senderAddress);

    console.log(
        "Sender ETH balance:",
        ethers.formatEther(senderBalance),
        "ETH"
    );

    // Value stored in the Solidity mapping
    const mappingBalance = await contract.balances(senderAddress);

    console.log(
        "balances[sender] in wei:",
        mappingBalance.toString()
    );

    console.log(
        "balances[sender] in ETH:",
        ethers.formatEther(mappingBalance),
        "ETH"
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });