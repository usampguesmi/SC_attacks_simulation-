const pool = require("../db");

async function createEOA(
    accountAddress,
    chainId,
    publicKey,
    client = pool
) {
    const query = `
        INSERT INTO eoa (
            account_address,
            chain_id,
            publickey
        )
        VALUES ($1, $2, $3)
         ON CONFLICT (account_address, chain_id) DO NOTHING;
    `;
    await client.query(query, [accountAddress, chainId, publicKey]);
}

module.exports = {
    createEOA
};