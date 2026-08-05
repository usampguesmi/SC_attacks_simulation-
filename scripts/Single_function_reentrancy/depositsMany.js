const {ethers} = require ("hardhat");
const fs = require("fs");
const path = require ("path");
const artifact_ReentrancyTest= require ("../../artifacts/contracts/ReentrancyTest.sol/ReentrancyTest.json")
const artifact_Attacker= require ("../../artifacts/contracts/Attacker.sol/Attacker.json")

async function main (){
    const deploymentPath = path.join(
                __dirname,
                "../deployment",
                "deployment_localhost.json"
            );
    const deployment = JSON.parse(
                    fs.readFileSync(deploymentPath, "utf8")
                );
    const signers = await ethers.getSigners();
    const signer = signers[0];
    const  user1 = signers[1];
    const  user2 = signers[2];
    const  user3 = signers[3];
    const  user4 = signers[4];
    const  user5 = signers[5];
    const  user6 = signers[6];
    const  attacker = signers[7];

    /*for (let i=0; i<=7;i++){
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[0].address)) )
    }*/
    
    const attackerAddress = deployment.contracts.Attacker.address;
    const ReentrancyTestAddress = deployment.contracts.ReentrancyTest.address;
    const contract_Attacker = new ethers.Contract(
        attackerAddress,
        artifact_Attacker.abi,
        signer
    )
    const contract_ReentrancyTest = new ethers.Contract(
        ReentrancyTestAddress,
        artifact_ReentrancyTest.abi,
        signer
    );
    
    const calldata= contract_ReentrancyTest.interface.encodeFunctionData("deposit");
    const n = 10;

    for (let i=1; i<=7;i++){
        const random= Math.floor(Math.random()*n);
        console.log(random);
        console.log(ethers.parseEther(random.toString()));
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
        const tx = await signers[i].sendTransaction({
            to: ReentrancyTestAddress,
            data : calldata,
            value: ethers.parseEther(random.toString())
        });
        const receipt = await tx.wait();
        console.log("Transaction hash: ", tx.hash);
        console.log("address of signer ", i , " : ", signers[i].address , " and balance = ", await ethers.formatEther(await ethers.provider.getBalance(signers[i].address)) )
        
    }

}
main().catch(console.error);
