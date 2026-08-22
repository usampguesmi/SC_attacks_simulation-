const pool = require("../db");

async function createEOA(
    accountAddress,
    chainId,
    publicKey
) {
    const query = `
        INSERT INTO eoa (
            account_address,
            chain_id,
            publickey
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (account_address, chain_id)
        DO NOTHING;
    `;

    const values = [
        accountAddress,
        chainId,
        publicKey
    ];

    await pool.query(query, values);
}

module.exports = {
    createEOA
};