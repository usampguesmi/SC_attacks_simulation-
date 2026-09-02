const { ethers } = require("hardhat");
const Table = require("cli-table3");

/**
 * Displays a table of arbitrary accounts (contracts or EOAs), showing
 * each one's name, address, and current ETH balance. Fully generic -
 * doesn't know or care what kind of contracts are passed in.
 *
 * @param {string} title - heading printed above the table
 * @param {Array<{name: string, address: string, notes?: string}>} accounts
 *   - name: label to display (e.g. "Victim Bank", "Attacker Contract", "Signer")
 *   - address: the account's address (contract or EOA)
 *   - notes: optional free-text extra info, computed by the caller
 *     beforehand (e.g. "attackCount: 3", "balances[signer]: 1.0 ETH") -
 *     lets callers surface contract-specific state without this
 *     function needing to know about any specific contract's ABI
 */
async function displayState(title, accounts) {
    const table = new Table({
        head: ["Name", "Address", "Balance", "Notes"],
        colWidths: [25, 45, 20, 35]
    });

    for (const { name, address, notes } of accounts) {
        const balance = await ethers.provider.getBalance(address);
        table.push([
            name,
            address,
            `${ethers.formatEther(balance)} ETH`,
            notes || ""
        ]);
    }

    console.log(`\n========== ${title} ==========\n`);
    console.log(table.toString());
}

module.exports = {
    displayState
};