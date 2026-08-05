const {ethers} = require ("hardhat");
const {loadContext} = require ("../Single_function_reentrancy/context.js");

async function main (){
const ctx = await loadContext();
console.log("attacker balance before transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)));
const tx = await ctx.attacker.sendTransaction({
    to:ctx.attackerAddress,
    value: ethers.parseEther("1")
})
const reseipt = await tx.wait();
console.log(" transaction hash ",tx.hash)


console.log("attacker balance after transfer", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)));
}
main().catch(console.error);