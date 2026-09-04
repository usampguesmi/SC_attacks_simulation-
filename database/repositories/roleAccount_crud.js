const pool = require("../db");

async function createRoleAccount({
    mainTxId,
    mainChainId,
    mainHashTx,
    accountAddress,
    chainId,
    participationType,     // 'FROM' | 'TO' | 'OTHER'
    roleAccount,            // 'ATTACKER' | 'VICTIM' | 'NEUTRAL' | 'VICTIM_AND_ATTACKER' | null (filled in later manually)
    balanceBeforeTx,
    balanceAfterTx,
    functionSelector,
    client = pool,
}) {
    const query = `
        INSERT INTO role_account (
            main_tx_id,
            main_chain_id,
            main_hash_tx,
            account_address,
            chain_id,
            participation_type,
            role_account,
            balance_before_tx,
            balance_after_tx,
            function_selector
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
    `;

    const values = [
        mainTxId,
        mainChainId,
        mainHashTx,
        accountAddress,
        chainId,
        participationType,
        roleAccount,
        balanceBeforeTx,
        balanceAfterTx,
        functionSelector,
    ];

    const result = await client.query(query, values);
    return result.rows[0]; // { id }
}

module.exports = { createRoleAccount };