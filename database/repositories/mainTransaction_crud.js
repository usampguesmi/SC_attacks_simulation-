// mainTransaction_crud.js
const pool = require("../db");

async function createMainTransaction(txId, txHash, chainId, indexInBlock, txStatus, transaction_purpose) {
    const query = `
        INSERT INTO main_transaction (
            tx_id,
            tx_hash,
            chain_id,
            index_in_block,
            tx_status,
            transaction_purpose
        )
        VALUES ($1, $2, $3, $4, $5,  $6 );
    `;

    const values = [txId, txHash, chainId, indexInBlock, txStatus, transaction_purpose];

    await pool.query(query, values);
}

module.exports = { createMainTransaction };