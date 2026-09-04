const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
async function main() {

    const deploymentPath = path.join(
            __dirname,
            "../deployment",
            "deployment_sepolia.json"
    );
    
   // Read existing deployment file
    const deployment = JSON.parse(
        fs.readFileSync(deploymentPath, "utf8")
    );

    const argument = deployment.contracts.VulnerableBank.address;

    const [owner] = await ethers.getSigners();

    const TestContract = await ethers.getContractFactory("ContractA");
    const test = await TestContract.connect(owner).deploy();
    await test.waitForDeployment();
    const testAddress = await test.getAddress();
   console.log("address : ", testAddress)
      
   deployment.contracts.ContractA= {
        address: testAddress
    };

    fs.writeFileSync(
       deploymentPath,
        JSON.stringify(deployment, null, 2)
    );

     console.log("Deployment file updated.");
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});