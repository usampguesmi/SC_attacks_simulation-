  const {ethers} = require("hardhat");
  const {saveTrace} = require("../../utils/saveTrace.js");
  const {loadContext} = require ("../../utils/context.js");
  const {displayState} = require("../../utils/displayState2.js")
  async function main () {

    //load context
    const ctx = await loadContext();

    // check accounts state
    let attackCount = await ctx.contractAttacker_drainAll.attackCount();
    const balancesMapping1 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("Before Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker_drainAllAddress, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping1)} ETH` }
]);

// send transaction -- example deposit()
    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractVulnerableBank.interface.encodeFunctionData("deposit");
    const tx = await ctx.signer.sendTransaction({
          to : ctx.VulnerableBankAddress,
          data: calldata,
          value: ethers.parseEther("0.0001")    
      })
    const receipt = await tx.wait();
    console.log(tx.hash);

    attackCount = await ctx.contractAttacker_drainAll.attackCount();
    const balancesMapping2 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("After Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker_drainAllAddress, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping2)} ETH` }
    ]);

  
  }
  main().catch(console.error);
