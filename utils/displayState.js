const { ethers } = require("hardhat");
const Table = require("cli-table3");

async function displayState(
    title,
    reentrancyTestAddress,
    attackerAddress,
    contractReentrancyTest,
    contractAttacker,
    signer
) {
    // Get balances
    const  ReentrancyTest_Balance= await ethers.provider.getBalance(
        reentrancyTestAddress
    );

    const attackerContract_Balance = await ethers.provider.getBalance(
        attackerAddress
    );

     const signer_Balance = await ethers.provider.getBalance(
        signer.address
    );

    const attackCount = await contractAttacker.attackCount();

    const balancesmapping1 = await contractReentrancyTest.balances(signer.address);

    // Create table
    const table = new Table({
        head: ["Title", "Value"],
        colWidths: [30, 50]
    });

    table.push(
        [
            "Victim Balance",
            `${ethers.formatEther(ReentrancyTest_Balance)} ETH`
        ],
        [
            "Attacker Contract Balance",
            `${ethers.formatEther(attackerContract_Balance)} ETH`
        ],
        [
            "Signer Balance ",
            `${ethers.formatEther(signer_Balance)} ETH`
        ],
        [
            "Attack Count",
            attackCount.toString()
        ],
        [
            "Signer mapping value ",
            `${ethers.formatEther(balancesmapping1)} ETH`
        ]
    );

    console.log(`\n========== ${title} ==========\n`);
    console.log(table.toString());
}

module.exports = {
    displayState
};