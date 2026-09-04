const pool = require("../db");
const hre = require("hardhat"); 
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
    function_name,
    client = pool
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
            function_selector,
            function_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        function_name   
    ];

    const result = await client.query(query, values);
    return result.rows[0]; // { id }
}

// ★ ENTIRELY NEW FUNCTION — inserts the FROM + TO role_account rows for the
// main transaction. Fetches real on-chain balances before/after the block.
async function insertMainRoleAccounts({
    mainTx,
    blockNumber,
    fromAddress,
    fromAddressChainId,
    toAddress,
    toAddressChainId,
    functionSelector,
    fromRole,   
    toRole ,
    function_name
}) {
    const fromBalanceBefore = await hre.ethers.provider.getBalance(fromAddress, blockNumber - 1);
    const fromBalanceAfter = await hre.ethers.provider.getBalance(fromAddress, blockNumber);
    const toBalanceBefore = await hre.ethers.provider.getBalance(toAddress, blockNumber - 1);
    const toBalanceAfter = await hre.ethers.provider.getBalance(toAddress, blockNumber);

    await createRoleAccount({
        mainTxId: mainTx.tx_id,
        mainChainId: mainTx.chain_id,
        mainHashTx: mainTx.tx_hash,
        accountAddress: fromAddress,
        chainId: fromAddressChainId,
        participationType: "FROM",
        roleAccount: fromRole, // you fill this in manually later, via a separate script
        balanceBeforeTx: fromBalanceBefore,
        balanceAfterTx: fromBalanceAfter,
        functionSelector,
        function_name
    });
    await createRoleAccount({
        mainTxId: mainTx.tx_id,
        mainChainId: mainTx.chain_id,
        mainHashTx: mainTx.tx_hash,
        accountAddress: toAddress,
        chainId: toAddressChainId,
        participationType: "TO",
        roleAccount: toRole,
        balanceBeforeTx: toBalanceBefore,
        balanceAfterTx: toBalanceAfter,
        functionSelector,
        function_name
    });

    console.log("role_account rows created for main_transaction (FROM + TO).");
}

module.exports = { createRoleAccount, insertMainRoleAccounts };