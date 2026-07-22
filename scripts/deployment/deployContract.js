const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {

    const [owner, , , attackerEOA] = await ethers.getSigners();
   
    const TestContract = await ethers.getContractFactory("testContract");
    const test = await TestContract.connect(owner).deploy();
    await test.waitForDeployment();
    const testAddress = await test.getAddress();
   console.log("address : ", testAddress)

    // ── Save addresses ─────────────────────────────────────
    const deployment = {
        network: "hardhat",
        timestamp: new Date().toISOString(),
        contracts: {
            TestContract: {
                address: testAddress,
            } 
        }
    };

    fs.writeFileSync(
        "deployment.json",
        JSON.stringify(deployment, null, 2)
    );
}
main().catch(console.error);