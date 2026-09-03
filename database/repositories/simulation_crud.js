const pool = require("../db");
const hre = require("hardhat");
const hardhatPackage = require("hardhat/package.json");

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
            environment,
            chain_id,
            attack_name,
            environment_version,
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

    // return both, so this function is consistent with getOrCreateSimulation below
    return { simulationId: result.rows[0].simulation_id, chainId };
}

async function getOrCreateSimulation(attackName) {

    // ============================================================
    // 1. Collect simulation environment information
    // ============================================================

    const network = await hre.ethers.provider.getNetwork();

    const solidityVersion =
        hre.config.solidity.compilers[0].version;

    const environment = "Hardhat";

    const environmentVersion =
        hardhatPackage.version;

    const chainId =
        Number(network.chainId);

    const evmHardfork =
        hre.config.networks.hardhat.hardfork;


    // ============================================================
    // 2. Check whether this simulation already exists
    // ============================================================

    const selectQuery = `
        SELECT simulation_id
        FROM simulation
        WHERE solidity_version = $1
          AND environment = $2
          AND environment_version = $3
          AND chain_id = $4
          AND attack_name = $5
          AND evm_hardfork = $6
        LIMIT 1;
    `;

    const values = [
        solidityVersion,
        environment,
        environmentVersion,
        chainId,
        attackName,
        evmHardfork
    ];

    const existingSimulation =
        await pool.query(selectQuery, values);


    // ============================================================
    // 3. If simulation exists, return its ID + chainId
    // ============================================================

    if (existingSimulation.rows.length > 0) {

        const simulationId =
            existingSimulation.rows[0].simulation_id;

        console.log(
            "Existing simulation found:",
            simulationId
        );

        return { simulationId, chainId };
    }


    // ============================================================
    // 4. Otherwise create the simulation
    // ============================================================

    const insertQuery = `
        INSERT INTO simulation (
            solidity_version,
            environment,
            environment_version,
            chain_id,
            attack_name,
            evm_hardfork
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING simulation_id;
    `;

    const result =
        await pool.query(insertQuery, values);

    const simulationId =
        result.rows[0].simulation_id;

    console.log(
        "New simulation created:",
        simulationId
    );

    return { simulationId, chainId };
}

module.exports = {
    createSimulation,
    getOrCreateSimulation
};