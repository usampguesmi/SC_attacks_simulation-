const {ethers} = require("hardhat");
async function main () {
const txHash = "0xd0cf863318c3b18c2e98cbcc91c858b02c42505259fc0b3c682eae9c74c2b453";

const tx = await ethers.provider.send(
    "eth_getTransactionByHash",
    [txHash]
);

console.log(tx)}

main()
