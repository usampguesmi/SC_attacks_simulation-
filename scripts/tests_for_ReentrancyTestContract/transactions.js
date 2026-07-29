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


// Get contract balance before the transaction
const balanceContract1 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 1 :", balanceContract1);

const senderAddress = await signers[0].getAddress();
const senderBalance = await ethers.provider.getBalance(senderAddress);
console.log("Sender:", senderAddress);
console.log("Sender balance:", ethers.formatEther(senderBalance), "ETH");

const nonce = await ethers.provider.getTransactionCount(
    sender,
    "latest"
);
console.log("Using nonce:", nonce);


const callData = contract.interface.encodeFunctionData("getBalanceOfsender");
const tx = await signers[0].sendTransaction({
    to: reentrancyTestAddress,
    data: callData,
  // value: ethers.parseEther("0.1")

});
const receipt = await tx.wait();
console.log("Transaction hash:", tx.hash);


// Get contract balance after the transaction
const balanceContract2 = await ethers.provider.getBalance(reentrancyTestAddress);
console.log("Contract balance 2 :", balanceContract2);
// Invoke the balances[msg.sender] after the transaction
const balancesender2 = await contract.getBalanceOfsender();
console.log("sender balance 2:", balancesender2.toString());

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

//console.log("Trace object:", trace);
//console.log("Number of structLogs:", trace.structLogs?.length);

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