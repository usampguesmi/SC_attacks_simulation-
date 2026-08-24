// transactionReccord_crud.js
const pool = require("../db");

async function createTransactionRecord(data) {
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
            fromAddress_chain_id,
            to_address,
            toAddress_chain_id,
            transaction_purpose,
            geth_traces
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15
        )
        RETURNING tx_id;
    `;

    const values = [
        data.txValue,
        data.blockNumber,
        data.txTimestamp,
        data.gasUsed,
        data.tracesLength,
        data.opcodeTraces,
        data.opcodeStackTraces,
        data.fullEvmExecTraces,
        data.simulationId,
        data.fromAddress,
        data.fromAddressChainId,
        data.toAddress,
        data.toAddressChainId,
        data.transactionPurpose,
        data.gethTraces
    ];

    const result = await pool.query(query, values);
    return result.rows[0].tx_id;
}

module.exports = { createTransactionRecord };