  const path = require("path");
  const {ethers} = require("hardhat");
  require("dotenv").config();

  const {loadContext} = require ("../../utils/context.js");
  const {displayState} = require("../../utils/displayState2.js")
  const { transaction_reccord_values } = require("../scripts/simulate_transaction.js");

  async function main () {

    //load context
    const ctx = await loadContext();

    // check accounts state
    const balancesMapping1 = await ctx.contractReentrancyTest.balances(ctx.signer);
    await displayState("Before transaction", [
    { name: "Victim (vulnerable bank)", address: ctx.reentrancyTestAddress },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping1)} ETH` }
]);

// send transaction -- example deposit()
    const amount = ethers.parseEther("1.3");
    const calldata = ctx.contractReentrancyTest.interface.encodeFunctionData("deposit");
    const tx = await ctx.signer.sendTransaction({
          to : ctx.reentrancyTestAddress,
          data: calldata,
          value: ethers.parseEther("0.00000000000001")    
      })
    const receipt = await tx.wait();
    console.log(tx.hash);

     // ── record the transaction ──────────────────────────────────
      
    console.log("\nRecording transaction...");
    const attack_name = "sf_reentrancy"; // must match an existing row in the Attack table
    const outputDir1 = path.join(__dirname, "../../traces_tests/full"); // for saving the traces of the whole transaction
    const filePrefix1 = "deposit";
    const baseOutputDir = path.join(__dirname, "../../traces_tests/internal");
    const folderName = "test_folder";
    const function_name = "deposit";
    const fromRole = "NEUTRAL";
    const toRole = "NEUTRAL";
    const transactionPurpose = "INSTRUMENTATION"; // example value, adjust as needed

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


    const balancesMapping2 = await ctx.contractReentrancyTest.balances(ctx.signer);
    await displayState("After transaction", [
    { name: "contractReentrancyTest", address: ctx.reentrancyTestAddress },
    { name: "Signer", address: ctx.signer.address, notes: `balances[signer]: ${ethers.formatEther(balancesMapping2)} ETH` }
    ]);
  
  }
  main().catch(console.error);
