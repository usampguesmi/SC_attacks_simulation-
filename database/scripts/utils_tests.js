// scripts/deployAndTriggerB.js
const hre = require("hardhat");
  const {loadContext} = require ("../../utils/context.js");
async function main() {
    const ctx = await loadContext();
    const tx = await ctx.contractContractA.deployB();
    await tx.wait();

    console.log("txHash:", tx.hash);
}

main().catch(console.error);