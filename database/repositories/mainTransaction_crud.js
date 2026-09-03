// mainTransaction_crud.js
const pool = require("../db");

async function createMainTransaction({
    txHash,
    chainId,
    txValue,
    blockNumber,
    indexInBlock,
    txTimestamp,
    txStatus,
    gasUsed,
    transactionPurpose,
    tracesLength,
    opcodeTraces,
    opcodeStackTraces,
    fullEvmExecTraces,
    simulationId,
    fromAddress,
    fromAddressChainId,
    toAddress,
    toAddressChainId,
}) {
    const query = `
        INSERT INTO main_transaction (
            tx_hash,
            chain_id,
            tx_value,
            block_number,
            index_inBlock,
            tx_timestamp,
            tx_status,
            gas_used,
            transaction_purpose,
            traces_length,
            opcode_traces,
            opcode_stack_traces,
            full_evm_exec_traces,
            simulation_id,
            from_address,
            fromAddress_chain_id,
            to_address,
            toAddress_chain_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING tx_id, tx_hash, chain_id;
    `;

    const values = [
        txHash,
        chainId,
        txValue,
        blockNumber,
        indexInBlock,
        txTimestamp,
        txStatus,
        gasUsed,
        transactionPurpose,
        tracesLength,
        opcodeTraces,
        opcodeStackTraces,
        fullEvmExecTraces,
        simulationId,
        fromAddress,
        fromAddressChainId,
        toAddress,
        toAddressChainId,
    ];

    const result = await pool.query(query, values);
    return result.rows[0]; // { tx_id, tx_hash, chain_id } — needed by internal_transaction / role_account inserts
}

module.exports = { createMainTransaction };