const pool = require("../db");

async function createBlockchainNetwork(
    chainId,
    networkName,
    networkType
) {
    const query = `
        INSERT INTO blockchain_network (
            chain_id,
            network_name,
            network_type
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (chain_id)
        DO NOTHING;
    `;

    const values = [
        chainId,
        networkName,
        networkType
    ];

    await pool.query(query, values);
}

module.exports = {
    createBlockchainNetwork
};