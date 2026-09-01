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

async function transaction_reccord_values(txHash, transaction_purpose, attack_name, outputDir1, filePrefix1, outputDir2, baseOutputDir, folderName) {
   // outputDir1, filePrefix1 for saving the traces of the whole transaction 
   // outputDir2, filePrefix2 for saving geth traces  
   // for internal calls baseOutputDir, folderName
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
    const { simulationId, chainId } =  await getOrCreateSimulation(attack_name);

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
    const { trace, format1, format2,  format3, opcodeCount } = await saveTrace(txHash, outputDir1, filePrefix1);

    // separately-sourced trace from your own patched Geth node's MongoDB,
    // fetched over SSH/docker exec, kept byte-for-byte as-is
    const geth_traces = await fetchAndSaveGethTrace(txHash, outputDir2, filePrefix1);

    // ---------------------------------------------------------------
    // 5. Walk the trace and detect any internal calls (CALL/DELEGATECALL/
    //    STATICCALL/CREATE/CREATE2) that happened during execution.
    //    rootAddress = the address executing at depth 1, i.e. THIS
    //    transaction's own recipient - needed so detectInternalCalls can
    //    correctly track from_address across nested calls.
    // ---------------------------------------------------------------
    
     const internalCalls = detectInternalCalls(trace.structLogs, {
        blockNumber,
        timestamp: tx_Timestamp,
        rootAddress: toAddress
    });

    // =================================================================
    // BRANCH 1: no internal calls -> just one transaction_record +
    // one main_transaction row. Simple case, nothing nested to record.
    // =================================================================

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
            transactionPurpose,
            geth_traces
        };

        // insert transaction_record first - Postgres auto-generates tx_id
        // (GENERATED ALWAYS AS IDENTITY), returned via RETURNING tx_id
        const txId = await createTransactionRecord(transactionRecordData);
        console.log("transaction_record created, tx_id:", txId);

        // main_transaction REUSES that same tx_id as its own PK/FK -
        // this is the shared-PK subtype pattern in the schema
         await createMainTransaction(
            txId,
            txHash,
            chainId,
            receipt.index, // index_in_block
            receipt.status === 1  // tx_status (boolean)
        );
        console.log("main_transaction created, tx_id:", txId);

        return { mainTxId: txId, internalCallCount: 0 };
    }

    // =================================================================
    // BRANCH 2: internal calls present -> one "main" transaction_record
    // for the whole tx (full trace), PLUS one separate transaction_record
    // + internal_transaction row per internal call detected.
    // =================================================================

     console.log(`Detected ${internalCalls.length} internal call(s) - inserting main + child records.`);
    
     // --- 5a. Insert the MAIN transaction_record (covers the entire
    // top-level transaction, same as branch 1 above) ---
    const mainTransactionRecordData = {
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
        transactionPurpose,
        geth_traces
    };
    const mainTxId = await createTransactionRecord(mainTransactionRecordData);
    console.log("main transaction_record created, tx_id:", mainTxId);

    // --- 5b. Insert main_transaction, reusing mainTxId ---
    await createMainTransaction(
        mainTxId,
        txHash,
        chainId,
        receipt.index,
        receipt.status === 1
    );
    console.log("main_transaction created, tx_id:", mainTxId);

    // --- 5c. (optional) Save each internal call's own trace files to a
    // dedicated subfolder, e.g. ./traces/internal_calls/tx-abc123/call1-format1.txt ---
    await saveInternalCallTraces(internalCalls, baseOutputDir, folderName);

    // --- 5d. For EACH internal call: resolve its addresses, insert its
    // OWN transaction_record (child row), then insert the
    // internal_transaction row that links it back to mainTxId ---

    const insertedInternalTxIds = [];

    for (const call of internalCalls) {
    // resolveAccount handles both cases: address already known in DB
    // (returns immediately), or unknown (recursively resolves its
    // whole creator chain via Etherscan before inserting)

    const callFromResolved = await resolveAccount(call.from_address, chainId);
    const callToResolved = await resolveAccount(call.to_address, chainId);

    const callTransactionRecordData = {
            txValue: call.value,                 // ETH value of THIS specific internal call, not the whole tx
            blockNumber: call.block_number,       // identical to the parent tx's block - internal calls can't span blocks
            txTimestamp: call.timestamp,          // identical to the parent tx's timestamp, for the same reason
            gasUsed: call.gas_used,               // gas consumed while this frame (and anything nested inside it) was executing
            tracesLength: call.traces_length,     // opcode count within just this call's own slice of the trace
            opcodeTraces: call.opcode_traces,      // format1-style, scoped to this call's slice
            opcodeStackTraces: call.opcode_stack_traces, // format2-style, scoped to this call's slice
            fullEvmExecTraces: call.full_evm_exec_traces, // format3-style (raw JSON), scoped to this call's slice
            simulationId,                          // same simulation as the parent tx
            fromAddress: callFromResolved.accountAddress,
            fromAddressChainId: callFromResolved.chainId,
            toAddress: callToResolved.accountAddress,
            toAddressChainId: callToResolved.chainId,
            transactionPurpose: "internal",
            gethTraces: null // the patched-Geth raw trace is only captured once for the whole tx, not duplicated per internal call
        };

        // each internal call gets its own transaction_record row (its own tx_id)
        const callTxId = await createTransactionRecord(callTransactionRecordData);

        // then an internal_transaction row using that tx_id, pointing
        // back to mainTxId via main_tx_id - this is what actually marks
        // it as "an internal call belonging to this main transaction"
        await createInternalTransaction(
            callTxId,
            call.call_depth,
            call.call_type,
            call.call_index,
            call.start_opcode_index,
            call.end_opcode_index,
            mainTxId
        );

        console.log(`  internal call #${call.call_order} (${call.call_type}, depth ${call.call_depth}) -> tx_id ${callTxId}`);
        insertedInternalTxIds.push(callTxId);
    }
        return { mainTxId, internalCallCount: internalCalls.length, insertedInternalTxIds };
}

module.exports = { transaction_reccord_values };

// --- only runs when this file is executed directly, not when imported elsewhere ---
if (require.main === module) {

    const txHash = "0x942219b0645da96af2b89daf4f31441162bc67d1ef7fc7de28e15d609ff293c2"; 
    //async function transaction_reccord_values(txHash, transaction_purpose, attack_name, outputDir1, filePrefix1, outputDir2, baseOutputDir, folderName)
    transaction_reccord_values(txHash, )
        .then((result) => {
            console.log("Done:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}