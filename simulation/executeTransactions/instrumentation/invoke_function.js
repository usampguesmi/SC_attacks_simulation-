const {ethers} = require("hardhat");
const {saveTrace} = require("../../../utils/saveTrace.js");
const {loadContext} = require ("../../../utils/context.js");
const {displayState} = require ("../../../utils/displayState.js");
async function main () {
  // load context variables
  const ctx = await loadContext();

  // display accounts states before function execution
  await displayState("test", ctx.reentrancyTestAddress, ctx.attackerAddress, ctx.contractReentrancyTest, ctx.contractAttacker, ctx.signer )
  
  // execute transaction
  const amount = ethers.parseEther("0.0000001");
  const calldata = ctx.contractReentrancyTest.interface.encodeFunctionData("deposit");
  const tx = await ctx.signer.sendTransaction({
        to : ctx.attackerAddress,
        data: calldata,
        value: ethers.parseEther("0.0000001")    
    })
  receipt = await tx.wait();
  console.log(tx.hash);

// display accounts states after function execution
await displayState("test after", ctx.reentrancyTestAddress, ctx.attackerAddress, ctx.contractReentrancyTest, ctx.contractAttacker, ctx.signer )

// save traces on files
await saveTrace(tx.hash, "./traces/sepolia_traces/new_folder", "attack");

// save traces on postgreSQL


}
main().catch(console.error);
