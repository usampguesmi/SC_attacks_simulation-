const {getOrCreateSimulation} = require("../repositories/simulation_crud.js");
const { resolveAccount } = require("./testAccountResolver.js");
const {saveTrace} = require("../../utils/saveTrace.js")
const hre = require("hardhat");
const {createMainTransaction} = require("../repositories/mainTransaction_crud.js")
const {insertMainRoleAccounts} = require("../repositories/roleAccount_crud.js");

const { detectInternalCalls, saveInternalCallTraces, createInternalTransaction } = require("../repositories/internalTransaction_crud.js");

// ---------------------------------------------------------------
// Small logging helpers for clean, structured console output
// ---------------------------------------------------------------
function logSection(title) {
    console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

function logKV(label, value) {
    console.log(`  ${label.padEnd(22)} ${value}`);
}

function logOk(msg) {
    console.log(`  ✓ ${msg}`);
}

async function transaction_reccord_values(txHash, attack_name, transactionPurpose, outputDir1, filePrefix1, baseOutputDir, folderName, fromRole, toRole, function_name) {
    // outputDir1, filePrefix1 for saving the traces of the whole transaction
    // baseOutputDir, folderName for internal call trace files

    logSection("Simulation Run");
    logKV("Transaction hash", txHash);
    logKV("Attack name", attack_name);
    logKV("Purpose", transactionPurpose);
    logKV("Function name", function_name ?? "(not set)");
    logKV("From role / To role", `${fromRole} / ${toRole}`);

    // ---------------------------------------------------------------
    // 1. Fetch the raw transaction + receipt from the chain
    // ---------------------------------------------------------------
    const tx = await hre.ethers.provider.getTransaction(txHash);
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);

    const txValue = tx.value;
    const blockNumber = receipt.blockNumber;

    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const tx_Timestamp = new Date(Number(block.timestamp) * 1000);

    const gasUsed = receipt.gasUsed;
    const mainFunctionSelector = tx.data && tx.data !== "0x" ? tx.data.slice(0, 10) : null;

    logSection("Chain Data");
    logKV("Status", receipt.status === 1 ? "SUCCESS" : "REVERTED");
    logKV("Block number", blockNumber);
    logKV("Timestamp", tx_Timestamp.toISOString());
    logKV("Gas used", gasUsed.toString());
    logKV("Value (wei)", txValue.toString());
    logKV("Function selector", mainFunctionSelector ?? "(none / plain transfer)");

    // attack name --- example : const attack_name = "sf_reentrancy";
    const { simulationId, chainId } = await getOrCreateSimulation(attack_name);

    logSection("Simulation Context");
    logKV("simulation_id", simulationId);
    logKV("chain_id", chainId);

    // ---------------------------------------------------------------
    // 2. Resolve from_address / to_address (recursively resolves the
    //    whole creator chain if either turns out to be a contract not
    //    yet in the database - see resolveAccount.js)
    // ---------------------------------------------------------------
    const fromResolved = await resolveAccount(tx.from, chainId);
    const fromAddress = fromResolved.accountAddress;
    const fromAddressChainId = fromResolved.chainId;

    const toAddressRaw = tx.to || receipt.contractAddress;
    const toResolved = await resolveAccount(toAddressRaw, chainId);
    const toAddress = toResolved.accountAddress;
    const toAddressChainId = toResolved.chainId;

    logSection("Address Resolution");
    logKV("From", fromAddress);
    logKV("To", toAddress);

    // ---------------------------------------------------------------
    // 3. Fetch the full opcode-level trace (Hardhat/Geth debug_traceTransaction)
    // ---------------------------------------------------------------
    const { trace, format1, format2, format3, opcodeCount } = await saveTrace(txHash, outputDir1, filePrefix1);

    logSection("Trace");
    logKV("number ofOpcodes ", opcodeCount);
    logKV("Saved to", `${outputDir1}/${filePrefix1}-format[1|2|3]`);

    // ---------------------------------------------------------------
    // 4. Walk the trace and detect any internal calls (CALL/DELEGATECALL/
    //    STATICCALL/CREATE/CREATE2) that happened during execution.
    //    rootAddress = the address executing at depth 1, i.e. THIS
    //    transaction's own recipient - needed so detectInternalCalls can
    //    correctly track from_address across nested calls.
    // ---------------------------------------------------------------
    const internalCalls = detectInternalCalls(trace.structLogs, {
        rootAddress: toAddress
    });

    logKV("Internal calls detected", internalCalls.length);

    // =================================================================
    // BRANCH 1: no internal calls -> just one main_transaction row.
    // =================================================================
    if (internalCalls.length === 0) {

        logSection("Database Insert");
        logOk("No internal calls - inserting single main_transaction.");

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
            function_name
        });

        logOk(`main_transaction created — tx_id: ${mainTx.tx_id}`);

        await insertMainRoleAccounts({
            mainTx,
            blockNumber,
            fromAddress,
            fromAddressChainId,
            toAddress,
            toAddressChainId,
            functionSelector: mainFunctionSelector,
            fromRole,
            toRole,
            function_name
        });

        logOk("role_account rows created (FROM + TO).");

        logSection("Summary");
        logKV("main_tx_id", mainTx.tx_id);
        logKV("Internal calls", 0);
        console.log("");

        return { mainTxId: mainTx.tx_id, internalCallCount: 0 };
    }

    // =================================================================
    // BRANCH 2: internal calls present -> one main_transaction row for
    // the whole tx (full trace), PLUS one internal_transaction row per
    // internal call detected.
    // =================================================================

    logSection("Database Insert");
    logOk(`${internalCalls.length} internal call(s) detected — inserting main + child records.`);

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
        function_name
    });

    logOk(`main_transaction created — tx_id: ${mainTx.tx_id}`);

    await insertMainRoleAccounts({
        mainTx,
        blockNumber,
        fromAddress,
        fromAddressChainId,
        toAddress,
        toAddressChainId,
        functionSelector: mainFunctionSelector,
        fromRole,
        toRole,
        function_name
    });

    logOk("role_account rows created (FROM + TO).");

    // --- 5b. Save each internal call's own trace files to a dedicated subfolder ---
    await saveInternalCallTraces(internalCalls, baseOutputDir, folderName);
    logOk(`Internal call trace files saved to ${baseOutputDir}/${folderName}`);

    // --- 5c. For EACH internal call: resolve its addresses, then insert
    // the internal_transaction row, pointing back to the main transaction
    // via the composite FK (main_tx_id, chain_id, hash_tx) ---

    logSection("Internal Calls");

    const insertedInternalTxIds = [];

    for (const call of internalCalls) {
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

        const statusLabel = call.call_status === false ? "FAILED" : "ok";
        console.log(
            `  #${String(call.call_order).padEnd(2)} ${call.call_type.padEnd(12)} ` +
            `depth ${String(call.call_depth).padEnd(2)} ` +
            `${callFromResolved.accountAddress.slice(0, 10)}… → ${callToResolved.accountAddress.slice(0, 10)}… ` +
            `[${statusLabel}] tx_id=${internalTx.tx_id}`
        );

        insertedInternalTxIds.push(internalTx.tx_id);
    }

    logSection("Summary");
    logKV("main_tx_id", mainTx.tx_id);
    logKV("Internal calls", internalCalls.length);
    logKV("Internal tx_ids", insertedInternalTxIds.join(", "));
    console.log("");

    return { mainTxId: mainTx.tx_id, internalCallCount: internalCalls.length, insertedInternalTxIds };
}

module.exports = { transaction_reccord_values };

// --- only runs when this file is executed directly, not when imported elsewhere ---
if (require.main === module) {

    const txHash = "0xdf5caf40a9f8c5120726913398af21069b39d69e6737dc5b795368c137956b20";
    const attack_name = "sf_reentrancy"; // must match an existing row in the Attack table
    const outputDir1 = path.join(__dirname, "../../traces_tests/full");
    const filePrefix1 = "test";
    const baseOutputDir = path.join(__dirname, "../../traces_tests/internal");
    const folderName = "test_folder";
    const fromRole = "ATTACKER";
    const toRole = "VICTIM";
    const transactionPurpose = "INSTRUMENTATION"; // example value, adjust as needed
    const function_name = "attack";

    transaction_reccord_values(txHash, attack_name, transactionPurpose, outputDir1, filePrefix1, baseOutputDir, folderName, fromRole, toRole, function_name)
        .then((result) => {
            console.log("Done:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}