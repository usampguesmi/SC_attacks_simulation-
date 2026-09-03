  const {ethers} = require("hardhat");
  const {saveTrace} = require("../../utils/saveTrace.js");
  const {loadContext} = require ("../../utils/context.js");
  const {displayState} = require("../../utils/displayState2.js")
  const { transaction_reccord_values } = require("../scripts/call_transactionReccord_crud.js");
  require("dotenv").config();

  async function main () {

    //load context
    const ctx = await loadContext();

    // check accounts state
    let attackCount = await ctx.contractAttacker2.MAX_ATTACKS();
    const balancesMapping1 = await ctx.contractVulnerableBank.balances(ctx.signer);
    await displayState("Before Attack", [
    { name: "Victim (vulnerable bank)", address: ctx.VulnerableBankAddress },
    { name: "Attacker Contract", address: ctx.Attacker2Address, notes: `attackCount: ${attackCount}` },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping1)} ETH` }
]);

//transaction update the the attackCount value
    const tx1 = await ctx.contractAttacker2.setMaxAttacks(2); // whichever value you're testing
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
    const result = await transaction_reccord_values(
        tx.hash,                  // the attack transaction hash
        "MALICIOUS",                 // transaction_purpose
        "sf_reentrancy",          // attack_name
        "./traces_tests/full",          // outputDir1 — trace files
        "attack",                 // filePrefix1
        "./traces_tests/geth", 
         "./",            // baseOutputDir — internal call traces
        "attack_calls"            // folderName
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
