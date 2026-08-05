const {ethers} = require("hardhat");
const fs = require ("fs");
const path = require("path");

const artifact_ReentrancyTest= require ("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json")
const artifact_Attacker= require ("../../artifacts/contracts/Attacker.sol/Attacker.json")

async function main () {
     const deploymentPath = path.join(
            __dirname,
            "../deployment",
            "deployment_localhost.json"
        );
        const deployment = JSON.parse(
                fs.readFileSync(deploymentPath, "utf8")
            );
    const signers = await ethers.signers();
    const attakerAddress = deployment.contracts.Attacker.address;
    const ReentrancyTestAddress = deployment.contracts.ReentrancyTest.address;
    const contractAttacker = new ethers.Contract(
        attakerAddress,
        artifact_Attacker.abi,
        signers[0]
    );
    const contractReentrancyTest = new ethers.Contract(
        ReentrancyTestAddress,
        artifact_ReentrancyTest.abi,
        signers[0]
    );
}
main().catch(console.error);