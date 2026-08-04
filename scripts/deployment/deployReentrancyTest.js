const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [owner] = await ethers.getSigners();
    const ReentrancyTest = await ethers.getContractFactory("ReentrancyTest");
    console.log("address of owner is ", await owner.getAddress());
    console.log("balance of owner is ", ethers.formatEther(
  await ethers.provider.getBalance(await owner.getAddress())
));

    const reentrancyTest = await ReentrancyTest.connect(owner).deploy({gasLimit: 3000000});

    await reentrancyTest.waitForDeployment();
    const address = await reentrancyTest.getAddress();
    console.log("Address:", address);

    // Path to deployment_localhost.json
    const deploymentPath = path.join(__dirname, "deployment_localhost.json");
    let deployment = {};
    if (fs.existsSync(deploymentPath)) {
        deployment = JSON.parse(
            fs.readFileSync(deploymentPath, "utf8")
        );
    } else {
        deployment = {
            network: "Sepolia",
            timestamp: new Date().toISOString(),
            contracts: {}
        };
    }

    // Update metadata
    deployment.timestamp = new Date().toISOString();

    // Add the new contract
    deployment.contracts.ReentrancyTest = {
        address: address
    };

    // Save the updated file
    fs.writeFileSync(
        deploymentPath,
        JSON.stringify(deployment, null, 2)
    );

    console.log("deployment_localhost.json updated successfully.");
}

main().catch(console.error);