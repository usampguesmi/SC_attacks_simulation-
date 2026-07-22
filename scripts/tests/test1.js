const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const artifact = require("../../artifacts/contracts/testContract.sol/testContract.json");

async function main() {

const deploymentPath = path.join(__dirname, "../deployment", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const testContractAddress     = deployment.contracts.TestContract.address;

const signers = await ethers.getSigners();

const contract = new ethers.Contract (testContractAddress, artifact.abi, signers[0])

const callData = contract.interface.encodeFunctionData("getBalance");
const tx = await signers[0].sendTransaction({
    to: testContractAddress,
    data: callData
});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);

const trace = await ethers.provider.send(
    "debug_traceTransaction",
    [
        tx.hash,
        {
            disableMemory: false,
            disableStack: false,
            disableStorage: false
        }
    ]
);

const opcodeSequence = trace.structLogs.map(log => `${log.pc};${log.op}`);

const outputPath = path.join(__dirname, "opcode_sequence.txt");

fs.writeFileSync(outputPath, opcodeSequence.join("\n"));

const tracePath = path.join(
    __dirname,
    "getBalance-trace.json"
);

fs.writeFileSync(
    tracePath,
    JSON.stringify(trace, null, 2)
);

}

main().catch(console.error);