const { ethers, artifacts } = require("hardhat");

async function main() {
    const signers = await ethers.getSigners();

    const sender = await signers[0].getAddress();

    console.log("Sender:", sender);

    const latestBalance = await ethers.provider.getBalance(sender, "latest");
    const pendingBalance = await ethers.provider.getBalance(sender, "pending");

    console.log(
        "Latest balance:",
        ethers.formatEther(latestBalance),
        "ETH"
    );

    console.log(
        "Pending balance:",
        ethers.formatEther(pendingBalance),
        "ETH"
    );

    console.log(
        "Latest nonce:",
        await ethers.provider.getTransactionCount(sender, "latest")
    );

    console.log(
        "Pending nonce:",
        await ethers.provider.getTransactionCount(sender, "pending")
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});