const pool = require("../db");

async function createAccount(
    accountAddress,
    chainId
) {
    const query = `
        INSERT INTO account (
            account_address,
            chain_id
        )
        VALUES ($1, $2);
    `;

    const values = [
        accountAddress,
        chainId
    ];

    await pool.query(query, values);
}

async function findAccount(accountAddress, chainId) {

    const query = `
        SELECT
            account_address,
            chain_id
        FROM account
        WHERE account_address = $1
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