// scripts/deployAndTriggerB.js
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with EOA:", deployer.address);

    // 1. Deploy Contract A
    const ContractA = await hre.ethers.getContractFactory("ContractA");
    const contractA = await ContractA.deploy();
    await contractA.waitForDeployment();

    const contractAAddress = await contractA.getAddress();
    console.log("ContractA deployed at:", contractAAddress);

    // 2. Call deployB() on Contract A - this triggers Contract A to deploy Contract B
    const tx = await contractA.deployB();
    const receipt = await tx.wait();

    console.log("deployB() tx hash:", receipt.hash);

    // 3. Get Contract B's address - either from the return value stored on-chain...
    const contractBAddress = await contractA.lastDeployedB();
    console.log("ContractB deployed at:", contractBAddress);

    // ...or equivalently, read it back from the emitted event, as a cross-check
    const event = receipt.logs
        .map((log) => {
            try {
                return contractA.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find((parsed) => parsed && parsed.name === "BDeployed");

    console.log("ContractB address (from event):", event.args.bAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });