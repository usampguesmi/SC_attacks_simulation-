const pool = require("../db");

async function createSimulation(
    solidityVersion,
    environment,
    chainId,
    attackName,
    environment_version,
    evm_hardfork
) {
    const query = `
        INSERT INTO simulation (
            solidity_version,
            dev_environment,
            chain_id,
            attack_name,
            dev_environment_version,
            evm_hardfork
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING simulation_id;
    `;

    const values = [
        solidityVersion,
        environment,
        chainId,
        attackName,
        environment_version,
        evm_hardfork

    ];

    const result = await pool.query(query, values);

    return result.rows[0].simulation_id;
}

module.exports = {
    createSimulation
};