const pool = require("../db");

async function createInternalTransaction(
    txId,
    callDepth,
    callType,
    callIndex,
    startOpcodeIndex,
    endOpcodeIndex,
    mainTxId
) {
    const query = `
        INSERT INTO internal_transaction (
            tx_id,
            call_depth,
            call_type,
            call_index,
            start_opcode_index,
            end_opcode_index,
            main_tx_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

    const values = [
        txId,
        callDepth,
        callType,
        callIndex,
        startOpcodeIndex,
        endOpcodeIndex,
        mainTxId
    ];

    await pool.query(query, values);
}

module.exports = {
    createInternalTransaction
};