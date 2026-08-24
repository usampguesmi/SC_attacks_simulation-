const { createTransactionRecord } = require("../repositories/transactionReccord_crud.js");
const {getOrCreateSimulation} = require("../repositories/simulation_crud.js");

const { resolveAccount } = require("./testAccountResolver.js"); 
const {TransactionPurpose} = require("../repositories/enumeration.js");
const {saveTrace} = require("../../utils/saveTrace.js")
const hre = require("hardhat");
const hardhatPackage = require("hardhat/package.json");

async function transaction_reccord_values() {
    const txHash = "0x942219b0645da96af2b89daf4f31441162bc67d1ef7fc7de28e15d609ff293c2"; 
    const tx = await hre.ethers.provider.getTransaction(txHash);
    //console.log("Transaction object:", tx);
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
    //console.log("Transaction receipt:", receipt);

// tx_value
const blockchainTx =await hre.ethers.provider.getTransaction(receipt.hash);
const txValue = blockchainTx.value;
// block_number
const blockNumber = receipt.blockNumber;

// tx_Timestamp
const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
const Timestamp = block.timestamp;
const tx_Timestamp = new Date(Number(Timestamp) * 1000);

// gas_used
const gasUsed = receipt.gasUsed;

//transaction purpose
const transactionPurpose = TransactionPurpose.INSTRUMENTATION;
console.log(transactionPurpose)

// chain_id 
const attack_name = "sf_reentrancy"
const asb= await getOrCreateSimulation (attack_name)

// from_address / fromAddress_chain_id
const fromResolved = await resolveAccount(tx.from, chainId);
const fromAddress = fromResolved.accountAddress;
const fromAddressChainId = fromResolved.chainId;

// to_address / toAddress_chain_id
const toResolved = await resolveAccount(tx.to, chainId);
const toAddress = toResolved.accountAddress;
const toAddressChainId = toResolved.chainId;

const { opcode_traces, opcode_stack_traces,  full_evm_exec_traces, tracesLength } = await saveTrace(txHash, outputDir, filePrefix);











/*const transactionReccordId = await createTransactionRecord(
        
        
 );

    console.log("********* transaction_reccord saved! *********");
    console.log(" ********* transaction_reccord ID: *********", simulationId);*/
}


main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });