const pool = require("../db");
const hre = require("hardhat");

async function createAccount(
    accountAddress,
    chainId,
    client = pool
) {
    const query = `
        INSERT INTO account (
            account_address,
            chain_id
        )
        VALUES ($1, $2)
        ON CONFLICT (account_address, chain_id) DO NOTHING;
    `;

    await client.query(query, [accountAddress, chainId]);
}

async function findAccount(accountAddress, chainId) {

    const query = `
        SELECT
            account_address,
            chain_id
        FROM account
        WHERE LOWER(account_address) = LOWER($1)
          AND chain_id = $2;
    `;

    const values = [
        accountAddress,
        chainId
    ];

    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
        return {
            exists: true,
            accountAddress: result.rows[0].account_address,
            chainId: Number(result.rows[0].chain_id)
        };
    }

    return {
        exists: false,
        accountAddress,
        chainId
    };
}

async function getAccountType(accountAddress) {
    const code = await hre.ethers.provider.getCode(accountAddress);

    return {
        type: code === "0x" ? "EOA" : "SMART_CONTRACT",
        bytecode: code === "0x" ? null : code
    };
}

module.exports = {
    createAccount,
    findAccount,
    getAccountType
};