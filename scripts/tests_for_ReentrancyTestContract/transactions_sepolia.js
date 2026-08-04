const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const artifact = require("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json");

async function main() {

const deploymentPath = path.join(__dirname, "../deployment", "deployment_sepolia.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("deployment_sepolia.json not found. Run deploy.js first.");
    }
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

const reentrancyTestAddress = deployment.contracts.ReentrancyTest.address;
const signers = await ethers.getSigners();
const contract = new ethers.Contract (reentrancyTestAddress, artifact.abi, signers[0])


// Get contract balance before the transaction
const contractBalance1 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract ETH balance:", ethers.formatEther(contractBalance1), "ETH");
const senderAddress = await signers[0].getAddress();
const senderBalance1 = await ethers.provider.getBalance(senderAddress);
console.log("Sender:", senderAddress);
console.log("Sender ETH balance:",ethers.formatEther(senderBalance1), "ETH" );
const mappingBalance1 = await contract.balances(senderAddress);
console.log("balances[sender] in ETH:",ethers.formatEther(mappingBalance1),"ETH");

const sender = await signers[0].getAddress();
const nonce = await ethers.provider.getTransactionCount(
    sender,
    "latest"
);

// ************************** function ****************************** //
const callData = contract.interface.encodeFunctionData("WithdrawWithoutUpdatingState");
const gasEstimate = await ethers.provider.estimateGas({
    from: sender,
    to: reentrancyTestAddress,
    data: callData,
    //value: ethers.parseEther("0.000000001")
});
const tx = await signers[0].sendTransaction({
    to: reentrancyTestAddress,
    data: callData,
     nonce: nonce,
    gasLimit: 300000, 
   //value: ethers.parseEther("0.0000001")
});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);


// Get contract balance after the transaction
const contractBalance2 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract ETH balance:", ethers.formatEther(contractBalance2), "ETH");
const senderBalance2 = await ethers.provider.getBalance(senderAddress);
console.log("Sender ETH balance:",ethers.formatEther(senderBalance2), "ETH" );
const mappingBalance2 = await contract.balances(senderAddress);
console.log("balances[sender] in ETH:",ethers.formatEther(mappingBalance2),"ETH");

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
const opcodeSequence = trace.structLogs.map(log => `${log.pc};${log.op}`);
const outputPath = path.join(__dirname, "getBalanceOfsender-trace-format1.txt");
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
        "getBalanceOfsender-trace-format2.txt"
    );

    fs.writeFileSync(
        opcodeArgsOutputPath,
        opcodeSequenceWithArgs.join("\n")
    );

//******* Trace format 3: PC;OPCODE; ARGS ; *******// 
const tracePath = path.join(
    __dirname,
    "getBalanceOfsender-trace-format3.json"
);

fs.writeFileSync(
    tracePath,
    JSON.stringify(trace, null, 2)
);
}
main().catch(console.error);