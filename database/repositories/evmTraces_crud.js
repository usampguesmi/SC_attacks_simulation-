const pool = require("../db");

async function createEvmTrace(
    txId,
    opcodeIndex,
    pc,
    opcodeName,
    opcodeDepth,
    opcodeCategory,
    memory,
    stack,
    storage
) {
    const query = `
        INSERT INTO evm_traces (
            tx_id,
            opcode_index,
            pc,
            opcode_name,
            opcode_depth,
            opcode_category,
            memory,
            stack,
            storage
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

    const values = [
        txId,
        opcodeIndex,
        pc,
        opcodeName,
        opcodeDepth,
        opcodeCategory,
        memory,
        stack,
        storage
    ];

    await pool.query(query, values);
}

module.exports = {
    createEvmTrace
};