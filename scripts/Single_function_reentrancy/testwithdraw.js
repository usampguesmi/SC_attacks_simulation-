const {ethers}= require("hardhat");
const {loadContext} = require ("../Single_function_reentrancy/context.js");

async function main (){
    const ctx = await loadContext();
    console.log("reentrancyTest balance before transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));
    const calldata= ctx.contractReentrancyTest.interface.encodeFunctionData("withdraw", [ethers.parseEther("0.00025")]);
    const tx = await ctx.signer.sendTransaction({
        to: ctx.reentrancyTestAddress,
        data: calldata
    })

    const reseipt = await tx.wait();
    console.log(" transaction hash ",tx.hash)
    console.log("reentrancyTest balance after transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));
}
main().catch(console.error);            