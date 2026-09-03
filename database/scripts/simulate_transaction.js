const { createTransactionRecord } = require("../repositories/transactionReccord_crud.js");
const {getOrCreateSimulation} = require("../repositories/simulation_crud.js");
const {fetchAndSaveGethTrace} = require("./remoteTraceExport.js")
const { resolveAccount } = require("./testAccountResolver.js"); 
const {TransactionPurpose} = require("../repositories/enumeration.js");
const {saveTrace} = require("../../utils/saveTrace.js")
const hre = require("hardhat");
const {createMainTransaction} = require("../repositories/mainTransaction_crud.js")
const hardhatPackage = require("hardhat/package.json");

const { detectInternalCalls, saveInternalCallTraces, createInternalTransaction } = require("../repositories/internalTransaction_crud.js");

//async function transaction_reccord_values(txHash, transaction_purpose, attack_name, outputDir1, filePrefix1, outputDir2, baseOutputDir, folderName) {
async function transaction_reccord_values(txHash, attack_name) {
   // outputDir1, filePrefix1 for saving the traces of the whole transaction 
   // outputDir2, filePrefix2 for saving geth traces  
   // for internal calls baseOutputDir, folderName


// ---------------------------------------------------------------
    // 1. Fetch the raw transaction + receipt from the chain
// ---------------------------------------------------------------

const tx = await hre.ethers.provider.getTransaction(txHash);
const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);

// tx_value: the ETH sent with the top-level transaction itself
const txValue = tx.value;
// block_number: which block this transaction was mined in
const blockNumber = receipt.blockNumber;

// tx_timestamp: block.timestamp is in seconds (unix epoch) -
// JS Date expects milliseconds, hence the *1000
const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
const tx_Timestamp = new Date(Number(block.timestamp) * 1000);

// gas_used: actual gas consumed by the WHOLE transaction (all internal calls included)
const gasUsed = receipt.gasUsed;

// attack name --- example : const attack_name = "sf_reentrancy";
    const { simulationId, chainId } =  await getOrCreateSimulation(attack_name);
    console.log("chain id and simulationID", simulationId, chainId)

     // ---------------------------------------------------------------
    // 3. Resolve from_address / to_address (recursively resolves the
    //    whole creator chain if either turns out to be a contract not
    //    yet in the database - see resolveAccount.js)
    // ---------------------------------------------------------------
    const fromResolved = await resolveAccount(tx.from, chainId);   // <- chainId, not simulationChainId
    const fromAddress = fromResolved.accountAddress;
    const fromAddressChainId = fromResolved.chainId;
    console.log(fromAddress)
    console.log(fromAddressChainId)


    // tx.to is null for contract-deployment transactions - in that case
    // the real recipient-equivalent address is receipt.contractAddress instead
    const toAddressRaw = tx.to || receipt.contractAddress;
    const toResolved = await resolveAccount(toAddressRaw, chainId);
    const toAddress = toResolved.accountAddress;
    const toAddressChainId = toResolved.chainId;
    console.log(toAddress)
    console.log(toAddressChainId)
}

module.exports = { transaction_reccord_values };

// --- only runs when this file is executed directly, not when imported elsewhere ---
if (require.main === module) {

    const txHash = "0xacbd300d4eb8b59a4a7bb2e3e58f8827fe4a2c85da7f8eecf1ba34a28140d758";
    const attack_name = "sf_reentrancy"; // must match an existing row in the Attack table

    transaction_reccord_values(txHash, attack_name)
        .then((result) => {
            console.log("Done:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}