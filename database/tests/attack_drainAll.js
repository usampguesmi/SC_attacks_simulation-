  const path = require("path");
  const {ethers} = require("hardhat");
  const {loadContext} = require ("../../utils/context.js");
  const {displayState} = require("../../utils/displayState2.js")
  const { transaction_reccord_values } = require("../scripts/simulate_transaction.js");
  require("dotenv").config();

  async function main () {
    const ctx = await loadContext();

    // check accounts state brfotr trsndsction
    let attackCount = await ctx.contractAttacker_drainAll.attackCount();
    const balancesMapping1 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("Before Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker_drainAllAddress, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping1)} ETH` }
]);

// send transaction -- example deposit()
    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractAttacker_drainAll.interface.encodeFunctionData("attack");
    const tx = await ctx.signer.sendTransaction({
          to : ctx.Attacker_drainAllAddress ,
          data: calldata,
          value: ethers.parseEther("0.00002"),
          gasLimit: 500000
      })
    const receipt = await tx.wait();
    console.log(tx.hash);

    // ── record the transaction ──────────────────────────────────
      
   console.log("\nRecording transaction...");
       const attack_name = "sf_reentrancy"; 
       const outputDir1 = path.join(__dirname, "../../traces_tests/reenAttack/full"); 
       const filePrefix1 = "attack_drainAll";
       const baseOutputDir = path.join(__dirname, "../../traces_tests/reenAttack/internal");
       const folderName = "attack_drainAll";
       const function_name = "attack_drainAll";
       const fromRole = "ATTACKER";
       const toRole = "ATTACKER";
       const transactionPurpose = "MALICIOUS"; 
   
       const result = await transaction_reccord_values(
           tx.hash,                  // the attack transaction hash
           attack_name,
           transactionPurpose,
           outputDir1,
           filePrefix1, 
           baseOutputDir, 
           folderName,
           fromRole,  
           toRole,
           function_name     // folderName
       );
         
        console.log("Record result:", result);

    // ────────────────────────────────────────────────────────────
    attackCount = await ctx.contractAttacker_drainAll.attackCount();
    const balancesMapping2 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("After Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker_drainAllAddress, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping2)} ETH` }
    ]);
  }
  main().catch(console.error);
