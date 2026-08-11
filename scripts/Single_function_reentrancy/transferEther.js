const {ethers} = require ("hardhat");
const {loadContext} = require ("../Single_function_reentrancy/context.js");

async function main (){
const ctx = await loadContext();
console.log("reentrancyTest balance before transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));
const tx = await ctx.signer.sendTransaction({
    to: ctx.reentrancyTestAddress,
    value: ethers.parseEther("3")
})

const reseipt = await tx.wait();
console.log(" transaction hash ",tx.hash)
console.log("reentrancyTest balance after transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));
}
main().catch(console.error);