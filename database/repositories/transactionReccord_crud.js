const pool = require("../db");

async function createTransactionRecord(
    txValue,
    blockNumber,
    txTimestamp,
    gasUsed,
    tracesLength,
    opcodeTraces,
    opcodeStackTraces,
    fullEvmExecTraces,
    simulationId,
    fromAddress,
    fromAddressChainId,
    toAddress,
    toAddressChainId,
    transactionPurpose
) {
    const query = `
        INSERT INTO transaction_record (
            tx_value,
            block_number,
            tx_timestamp,
            gas_used,
            traces_length,
            opcode_traces,
            opcode_stack_traces,
            full_evm_exec_traces,
            simulation_id,
            from_address,
            fromaddress_chain_id,
            to_address,
            toaddress_chain_id,
            transaction_purpose
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING tx_id;
    `;

    const values = [
        txValue,
        blockNumber,
        txTimestamp,
        gasUsed,
        tracesLength,
        opcodeTraces,
        opcodeStackTraces,
        fullEvmExecTraces,
        simulationId,
        fromAddress,
        fromAddressChainId,
        toAddress,
        toAddressChainId,
        transactionPurpose
    ];

    const result = await pool.query(query, values);

    return result.rows[0].tx_id;
}

module.exports = {
    createTransactionRecord
};