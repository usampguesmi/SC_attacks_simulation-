const path = require("path");
const { createTransactionRecord } = require("../repositories/transactionReccord_crud.js");
const {getOrCreateSimulation} = require("../repositories/simulation_crud.js");
const {fetchAndSaveGethTrace} = require("./remoteTraceExport.js")
const { resolveAccount } = require("./testAccountResolver.js"); 
const {TransactionPurpose} = require("../repositories/enumeration.js");
const {saveTrace} = require("../../utils/saveTrace.js")
const hre = require("hardhat");
const {createMainTransaction} = require("../repositories/mainTransaction_crud.js")
const hardhatPackage = require("hardhat/package.json");
const {insertMainRoleAccounts} = require("../repositories/roleAccount_crud.js");

const { detectInternalCalls, saveInternalCallTraces, createInternalTransaction } = require("../repositories/internalTransaction_crud.js");

//async function transaction_reccord_values(txHash, transaction_purpose, attack_name, outputDir1, filePrefix1, outputDir2, baseOutputDir, folderName) {
async function transaction_reccord_values(txHash, attack_name, transactionPurpose, outputDir1, filePrefix1, baseOutputDir, folderName, fromRole, toRole) {
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

// ★ NEW: function_selector for the MAIN transaction — first 4 bytes of the top-level calldata
    const mainFunctionSelector = tx.data && tx.data !== "0x" ? tx.data.slice(0, 10) : null;


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
    console.log("from address", fromAddress)

    // tx.to is null for contract-deployment transactions - in that case
    // the real recipient-equivalent address is receipt.contractAddress instead
    const toAddressRaw = tx.to || receipt.contractAddress;
    const toResolved = await resolveAccount(toAddressRaw, chainId);
    const toAddress = toResolved.accountAddress;
    const toAddressChainId = toResolved.chainId;
    console.log("To address", toAddress)

    // ---------------------------------------------------------------
    // 2. Fetch the full opcode-level trace (Hardhat/Geth debug_traceTransaction)
    // ---------------------------------------------------------------

    // saveTrace returns: the raw trace object (with structLogs), plus
    // format1: opcode_traces (pc;OPCODE), format2: opcode_stack_traces (pc;OPCODE;stack), format3: full_evm_exec_traces (raw JSON string)
    const { trace, format1, format2,  format3, opcodeCount } = await saveTrace(txHash, outputDir1, filePrefix1);

 
    // ---------------------------------------------------------------
    // . Walk 5the trace and detect any internal calls (CALL/DELEGATECALL/
    //    STATICCALL/CREATE/CREATE2) that happened during execution.
    //    rootAddress = the address executing at depth 1, i.e. THIS
    //    transaction's own recipient - needed so detectInternalCalls can
    //    correctly track from_address across nested calls.
    // ---------------------------------------------------------------
    
     const internalCalls = detectInternalCalls(trace.structLogs, {
        rootAddress: toAddress
     });

     console.log("Internal calls detected:", internalCalls.length);       
    // BRANCH 1: no internal calls -> just one main_transaction row.
    // Simple case, nothing nested to record.
    // =================================================================

    if (internalCalls.length === 0) {

        console.log("No internal calls detected - inserting as a single main_transaction.");

        const mainTx = await createMainTransaction({
            txHash,
            chainId,
            txValue,
            blockNumber,
            indexInBlock: receipt.index,
            txTimestamp: tx_Timestamp,
            txStatus: receipt.status === 1,
            gasUsed,
            transactionPurpose,
            tracesLength: opcodeCount,
            opcodeTraces: format1,
            opcodeStackTraces: format2,
            fullEvmExecTraces: format3,
            simulationId,
            fromAddress,
            fromAddressChainId,
            toAddress,
            toAddressChainId,
        });

        console.log("main_transaction created, tx_id:", mainTx.tx_id);

        // ★ NEW: insert role_account rows (FROM + TO) for the main transaction
        await insertMainRoleAccounts({
            mainTx,
            blockNumber,
            fromAddress,
            fromAddressChainId,
            toAddress,
            toAddressChainId,
            functionSelector: mainFunctionSelector,
            fromRole,   
            toRole    
        });


        return { mainTxId: mainTx.tx_id, internalCallCount: 0 };
    }

    // =================================================================
    // BRANCH 2: internal calls present -> one main_transaction row for
    // the whole tx (full trace), PLUS one internal_transaction row per
    // internal call detected.
    // =================================================================

    console.log(`Detected ${internalCalls.length} internal call(s) - inserting main + child records.`);

    // --- 5a. Insert the main_transaction row (same as Branch 1) ---
    const mainTx = await createMainTransaction({
        txHash,
        chainId,
        txValue,
        blockNumber,
        indexInBlock: receipt.index,
        txTimestamp: tx_Timestamp,
        txStatus: receipt.status === 1,
        gasUsed,
        transactionPurpose,
        tracesLength: opcodeCount,
        opcodeTraces: format1,
        opcodeStackTraces: format2,
        fullEvmExecTraces: format3,
        simulationId,
        fromAddress,
        fromAddressChainId,
        toAddress,
        toAddressChainId,
    });

    console.log("main_transaction created, tx_id:", mainTx.tx_id);

    // ★ NEW: insert role_account rows (FROM + TO) for the main transaction
    await insertMainRoleAccounts({
        mainTx,
        blockNumber,
        fromAddress,
        fromAddressChainId,
        toAddress,
        toAddressChainId,
        functionSelector: mainFunctionSelector,
        fromRole,   
        toRole 
    });


    // --- 5b. Save each internal call's own trace files to a dedicated subfolder ---
    await saveInternalCallTraces(internalCalls, baseOutputDir, folderName);

    // --- 5c. For EACH internal call: resolve its addresses, then insert
    // the internal_transaction row, pointing back to the main transaction
    // via the composite FK (main_tx_id, chain_id, hash_tx) ---

    const insertedInternalTxIds = [];

    for (const call of internalCalls) {
        // resolveAccount handles both cases: address already known in DB
        // (returns immediately), or unknown (recursively resolves its
        // whole creator chain via Etherscan before inserting)
        const callFromResolved = await resolveAccount(call.from_address, chainId);
        const callToResolved = await resolveAccount(call.to_address, chainId);

        const internalTx = await createInternalTransaction({
            mainTxId: mainTx.tx_id,
            chainId: mainTx.chain_id,
            hashTx: mainTx.tx_hash,
            callOrder: call.call_order,
            callDepth: call.call_depth,
            callType: call.call_type,
            callIndex: call.call_index,
            startOpcodeIndex: call.start_opcode_index,
            endOpcodeIndex: call.end_opcode_index,
            callStatus: call.call_status,
            txValue: call.value,
            gasUsed: call.gas_used,
            tracesLength: call.traces_length,
            opcodeTraces: call.opcode_traces,
            opcodeStackTraces: call.opcode_stack_traces,
            fullEvmExecTraces: call.full_evm_exec_traces,
            fromAddress: callFromResolved.accountAddress,
            fromAddressChainId: callFromResolved.chainId,
            toAddress: callToResolved.accountAddress,
            toAddressChainId: callToResolved.chainId,
        });

        console.log(`  internal call #${call.call_order} (${call.call_type}, depth ${call.call_depth}) -> tx_id ${internalTx.tx_id}`);
        insertedInternalTxIds.push(internalTx.tx_id);
    }

    return { mainTxId: mainTx.tx_id, internalCallCount: internalCalls.length, insertedInternalTxIds };
}

module.exports = { transaction_reccord_values };

// --- only runs when this file is executed directly, not when imported elsewhere ---
if (require.main === module) {

    const txHash = "0xdf5caf40a9f8c5120726913398af21069b39d69e6737dc5b795368c137956b20";
    const attack_name = "sf_reentrancy"; // must match an existing row in the Attack table
    const outputDir1 = path.join(__dirname, "../tests/traces_tests/full"); // for saving the traces of the whole transaction
    const filePrefix1 = "test";
    const baseOutputDir = path.join(__dirname, "../tests/traces_tests/internal");
    const folderName = "test_folder";
    const fromRole = "ATTACKER";   // ★ NEW
    const toRole = "VICTIM";

    transaction_reccord_values(txHash, attack_name,"INSTRUMENTATION", outputDir1, filePrefix1, baseOutputDir, folderName, fromRole, toRole)
        .then((result) => {
            console.log("Done:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}