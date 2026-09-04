// test_selector.js
const hre = require("hardhat");
const { detectInternalCalls } = require("../repositories/internalTransaction_crud.js");

async function main() {
    const txHash = "0x975e20c56b168a0372c1e29f4457c6d97df58ebaa390ccb733d657afa8a69c43";

    const trace = await hre.ethers.provider.send("debug_traceTransaction", [
        txHash,
        { disableMemory: false, disableStack: false, disableStorage: false }
    ]);
    
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
    const tx = await hre.ethers.provider.getTransaction(txHash);
    const rootAddress = tx.to || receipt.contractAddress;
    console.log("main tx selector:", tx.data.slice(0, 10));
     console.log(ethers.id("attack()").slice(0, 10));
    const calls = detectInternalCalls(trace.structLogs, { rootAddress });

    calls.forEach(call => {
        console.log(`call #${call.call_order} (${call.call_type}, depth ${call.call_depth})`);
        console.log(`  from: ${call.from_address}`);
        console.log(`  to:   ${call.to_address}`);
        console.log(`  selector: ${call.function_selector}`);
        console.log("---");
    });
}

main().catch(console.error);