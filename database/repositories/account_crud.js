const pool = require("../db");

async function createAccount(
    accountAddress,
    chainId,
    nonce
) {
    const query = `
        INSERT INTO account (
            account_address,
            chain_id,
            nonce
        )
        VALUES ($1, $2, $3);
    `;

    const values = [
        accountAddress,
        chainId,
        nonce
    ];

    await pool.query(query, values);
}

module.exports = {
    createAccount
};