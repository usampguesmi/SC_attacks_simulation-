const pool = require("../db");

async function createSmartContract(
    accountAddress,
    chainId,
    contractName,
    bytecode,
    solidityCode,
    blockNumberDeployment,
    txHashDeployment,
    timestampDeployment,
    creatorAddress,
    creatorChainId
) {
    const query = `
        INSERT INTO smartcontract (
            account_address,
            chain_id,
            scontract_name,
            bytecode,
            solidity_code,
            blocknumber_deployment,
            tx_hash_deployment,
            timestamp_deployment,
            creator_address,
            creator_chain_id
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10
        )
        ON CONFLICT (account_address, chain_id)
        DO NOTHING;
    `;

    const values = [
        accountAddress,
        chainId,
        contractName,
        bytecode,
        solidityCode,
        blockNumberDeployment,
        txHashDeployment,
        timestampDeployment,
        creatorAddress,
        creatorChainId
    ];

    await pool.query(query, values);
}

module.exports = {
    createSmartContract
};