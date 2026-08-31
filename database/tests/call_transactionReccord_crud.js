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

async function transaction_reccord_values(transaction_purpose, attack_name, outputDir1, filePrefix1, outputDir2, filePrefix2) {
    const txHash = "0x942219b0645da96af2b89daf4f31441162bc67d1ef7fc7de28e15d609ff293c2"; 

    // ---------------------------------------------------------------
    // 1. Fetch the raw transaction + receipt from the chain
    // ---------------------------------------------------------------

    const tx = await hre.ethers.provider.getTransaction(txHash);
    //console.log("Transaction object:", tx);
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
    //console.log("Transaction receipt:", receipt);

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

    //transaction purpose
    const transactionPurpose = transaction_purpose;

    // attack name --- example : const attack_name = "sf_reentrancy";
    const attack_name = attack_name
    const { simulationId, chainId: simulationChainId } = await getOrCreateSimulation(attack_name);

    // ---------------------------------------------------------------
    // 3. Resolve from_address / to_address (recursively resolves the
    //    whole creator chain if either turns out to be a contract not
    //    yet in the database - see resolveAccount.js)
    // ---------------------------------------------------------------
    const fromResolved = await resolveAccount(tx.from, chainId);   // <- chainId, not simulationChainId
    const fromAddress = fromResolved.accountAddress;
    const fromAddressChainId = fromResolved.chainId;

    // tx.to is null for contract-deployment transactions - in that case
    // the real recipient-equivalent address is receipt.contractAddress instead
    const toAddressRaw = tx.to || receipt.contractAddress;
    const toResolved = await resolveAccount(toAddressRaw, chainId);
    const toAddress = toResolved.accountAddress;
    const toAddressChainId = toResolved.chainId;

    // ---------------------------------------------------------------
    // 4. Fetch the full opcode-level trace (Hardhat/Geth debug_traceTransaction)
    //    AND the patched-Geth trace from the remote MongoDB, in parallel formats
    // ---------------------------------------------------------------

    // saveTrace returns: the raw trace object (with structLogs), plus
    // format1: opcode_traces (pc;OPCODE), format2: opcode_stack_traces (pc;OPCODE;stack), format3: full_evm_exec_traces (raw JSON string)
    const { opcode_traces, opcode_stack_traces,  full_evm_exec_traces, tracesLength } = await saveTrace(txHash, outputDir1, filePrefix1);

    // separately-sourced trace from your own patched Geth node's MongoDB,
    // fetched over SSH/docker exec, kept byte-for-byte as-is
    const geth_traces = await fetchAndSaveGethTrace(txHash, outputDir2, filePrefix2);

    // ---------------------------------------------------------------
    // 5. Walk the trace and detect any internal calls (CALL/DELEGATECALL/
    //    STATICCALL/CREATE/CREATE2) that happened during execution.
    //    rootAddress = the address executing at depth 1, i.e. THIS
    //    transaction's own recipient - needed so detectInternalCalls can
    //    correctly track from_address across nested calls.
    // ---------------------------------------------------------------
    
    const internalCalls = detectInternalCalls(trace.structLogs);
    if (internalCalls.length === 0) {

    console.log("No internal calls detected - inserting as a single transaction_record + main_transaction.");

    const transactionRecordData = {
            txValue,
            blockNumber,
            txTimestamp: tx_Timestamp,
            gasUsed,
            tracesLength: opcodeCount,
            opcodeTraces: format1,
            opcodeStackTraces: format2,
            fullEvmExecTraces: format3,
            simulationId,
            fromAddress,
            fromAddressChainId,
            toAddress,
            toAddressChainId,
            gethTraces
        };

        // 1. insert transaction_record, get back its generated tx_id
        const txId = await createTransactionRecord(transactionRecordData);
        console.log("transaction_record created, tx_id:", txId);

         await createMainTransaction(
            txId,
            txHash,
            chainId,
            receipt.index ?? receipt.transactionIndex, // index_in_block
            receipt.status === 1                        // tx_status (boolean)
        );
        console.log("main_transaction created, tx_id:", txId);

        return txId;
    }

if (internalCalls.length === 0) {
    
}



}













/*const transactionReccordId = await createTransactionRecord(
        
        
 );

    console.log("********* transaction_reccord saved! *********");
    console.log(" ********* transaction_reccord ID: *********", simulationId);*/



main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });