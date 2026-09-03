const hre = require("hardhat");

const {
    findAccount,
    getAccountType,
    createAccount
} = require("../repositories/account_crud.js");
const {fetchDeploymentInfoFromEtherscan} = require ("../repositories/etherscan_crud.js");
const {createEOA} = require("../repositories/eoa_crud.js");
const {createSmartContract} = require("../repositories/smartContract_crud.js");

async function checkAddressExistsOnChain(accountAddress, chainId) {

    // 1. format check - the only thing that's actually verifiable
    if (!hre.ethers.isAddress(accountAddress)) {
        return { valid: false, reason: "Malformed address" };
    }

    // 2. make sure we're querying the chain we claim to be checking against
    const network = await hre.ethers.provider.getNetwork();
    if (Number(network.chainId) !== Number(chainId)) {
        throw new Error(
            `Provider is connected to chain ${network.chainId}, but resolveAccount was called with chainId=${chainId}. ` +
            `Run this script with the matching --network flag.`
        );
    }
    return { valid: true };  
}

async function resolveAccount(accountAddress, chainId, scontractName = null ) {

    // --- validity check, before touching the DB or any API ---
    const check = await checkAddressExistsOnChain(accountAddress, chainId);
    if (!check.valid) {
        throw new Error(`resolveAccount: invalid address ${accountAddress} on chain ${chainId} - ${check.reason}`);
    }

    // normalize to EIP-55 checksummed form so the same address always resolves
    // to the same DB row regardless of the casing it arrived in (ethers returns
    // checksummed addresses, geth traces return lowercase ones)
    accountAddress = hre.ethers.getAddress(accountAddress);

    const account =
        await findAccount(
            accountAddress,
            chainId
        );
  // Account already exists
    if (account.exists) {
        console.log("Account exists in database.");
        return {
            accountAddress: account.accountAddress,
            chainId: account.chainId
        };
    }
    
 // Account does not exist
   console.log("Account does not exist in database.");

 // fetsh address type (smart contract or EOA )
   const { type: accountType, bytecode } = await getAccountType(accountAddress);
   if (accountType === "EOA") {
     // First insert parent Account
        await createAccount(
        accountAddress,
        chainId
    );
    console.log("new account created !")
    // Then insert EOA
    const publicKey = null;
    await createEOA(
        accountAddress,
            chainId,
            publicKey
    );
    console.log("new EOA account created !")
    return {
        accountAddress,
        chainId
    };
}

if (accountType === "SMART_CONTRACT") {

    // 1. fetch everything Etherscan knows about this contract
    const deploymentInfo = await fetchDeploymentInfoFromEtherscan(accountAddress, chainId);
    const smartContractData = {
        accountAddress,
        chainId,
        bytecode,
        name: scontractName || null,
        solidityCode: deploymentInfo?.solidityCode || null,
        blockNumberDeployment: deploymentInfo?.blockNumberDeployment || null,
        txHashDeployment: deploymentInfo?.txHashDeployment || null,
        timestampDeployment: deploymentInfo?.timestampDeployment || null,
        creatorAddress: deploymentInfo?.creatorAddress || null,   // null only when Etherscan didn't return it
        creatorChainId: deploymentInfo?.creatorChainId  || null   
    };

    if (smartContractData.creatorAddress) {
            await resolveAccount(smartContractData.creatorAddress, smartContractData.creatorChainId);
        }

    await createAccount(accountAddress, chainId);
    console.log("new account created !")
    await createSmartContract(
        accountAddress,
        chainId,
        smartContractData.name,
        bytecode,
        smartContractData.solidityCode,
        smartContractData.blockNumberDeployment,
        smartContractData.txHashDeployment,
        smartContractData.timestampDeployment,
        smartContractData.creatorAddress,
        smartContractData.creatorChainId
    );
    console.log("new smart contract created !")
    return { accountAddress, chainId };
}
}

module.exports = {
    resolveAccount
};

// --- test call: only runs when this file is executed directly ---
if (require.main === module) {
    const chainId = 11155111; // Sepolia

    // paste the ContractB address printed by deployAndTriggerB.js
    const contractBAddress = "0xB2FA9347370dFa4DfB627de71037986B0d76070c";

    resolveAccount(contractBAddress, chainId)
        .then((result) => {
            console.log("resolveAccount finished. Top-level result:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error("resolveAccount test failed:", error);
            process.exitCode = 1;
        });
}
