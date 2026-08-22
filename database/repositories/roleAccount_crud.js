const pool = require("../db");

async function createRoleAccount(
    txId,
    accountAddress,
    chainId,
    participationType,
    roleAccount,
    balanceBeforeTx,
    balanceAfterTx,
    functionSelector
) {
    const query = `
        INSERT INTO role_account (
            tx_id,
            account_address,
            chain_id,
            participation_type,
            role_account,
            balance_before_tx,
            balance_after_tx,
            function_selector
        )
        VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8
        );
    `;

    const values = [
        txId,
        accountAddress,
        chainId,
        participationType,
        roleAccount,
        balanceBeforeTx,
        balanceAfterTx,
        functionSelector
    ];

    await pool.query(query, values);
}

module.exports = {
    createRoleAccount
};