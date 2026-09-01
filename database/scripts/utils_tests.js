// scripts/testReceiptFields.js
const hre = require("hardhat");

async function main() {
    const txHash = "0x942219b0645da96af2b89daf4f31441162bc67d1ef7fc7de28e15d609ff293c2"; // swap for any real tx hash on your current network

    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);

    console.log(receipt);
    console.log("index:", receipt.index);
    console.log("transactionIndex:", receipt.transactionIndex);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });