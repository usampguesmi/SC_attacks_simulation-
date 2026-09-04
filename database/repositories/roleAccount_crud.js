const pool = require("../db");

async function createRoleAccount({
    transactionType,       // 'MAIN' | 'INTERNAL'
    mainTxId,
    mainChainId,
    mainHashTx,
    internalTxId,          // null when transactionType === 'MAIN'
    accountAddress,
    chainId,
    participationType,     // 'FROM' | 'TO' | 'OTHER'
    roleAccount,            // 'ATTACKER' | 'VICTIM' | 'NEUTRAL' | 'VICTIM_AND_ATTACKER'
    balanceBeforeTx,
    balanceAfterTx,
    functionSelector,
    client = pool,
}) {
    const query = `
        INSERT INTO role_account (
            transaction_type,
            main_tx_id,
            main_chain_id,
            main_hash_tx,
            internal_tx_id,
            account_address,
            chain_id,
            participation_type,
            role_account,
            balance_before_tx,
            balance_after_tx,
            function_selector
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id;
    `;

    const values = [
        transactionType,
        mainTxId,
        mainChainId,
        mainHashTx,
        internalTxId,
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