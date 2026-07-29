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
const testContractAddress = deployment.contracts.TestContract.address;

const signers = await ethers.getSigners();

const contract = new ethers.Contract (testContractAddress, artifact.abi, signers[0])

const code = await ethers.provider.getCode(testContractAddress);
//check if the contract is deployed at the address
console.log("Contract address:", testContractAddress);
console.log("Contract code:", code);

if (code === "0x") {
    throw new Error(
        "No contract is deployed at this address. Redeploy the contract."
    );
}

const callData = contract.interface.encodeFunctionData("checkMap");
const tx = await signers[0].sendTransaction({
    to: testContractAddress,
    data: callData,
});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);

     /*
     * Obtain the complete opcode-level trace.
     */
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

 //******* Trace format 1: PC;OPCODE *******//

console.log("Trace object:", trace);
console.log("Number of structLogs:", trace.structLogs?.length);

const opcodeSequence = trace.structLogs.map(log => `${log.pc};${log.op}`);
const outputPath = path.join(__dirname, "checkMap-trace-format1.txt");
fs.writeFileSync(
    outputPath,
    opcodeSequence.join("\n")
);

//******* Trace format 2: PC;OPCODE; ARGS ; *******// 
const opcodeSequenceWithArgs = trace.structLogs.map((log) => {
        const stack = Array.isArray(log.stack)
            ? [...log.stack].reverse()
            : [];

        const args = stack
            .map((value) =>
                value.startsWith("0x")
                    ? value
                    : `0x${value}`
            )
            .join(",");

        return `${log.pc};${log.op};${args}`;
    });

    const opcodeArgsOutputPath = path.join(
        __dirname,
        "checkMap-trace-format2.txt"
    );

    fs.writeFileSync(
        opcodeArgsOutputPath,
        opcodeSequenceWithArgs.join("\n")
    );

//******* Trace format 3: PC;OPCODE; ARGS ; *******// 
const tracePath = path.join(
    __dirname,
    "checkMap-trace-format3.json"
);

fs.writeFileSync(
    tracePath,
    JSON.stringify(trace, null, 2)
);
}
main().catch(console.error);