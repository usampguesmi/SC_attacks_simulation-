// etherscan_crud.js
require("dotenv").config();
const hre = require("hardhat");
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_BASE_URL = "https://api.etherscan.io/v2/api";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findTrueCreatorFromTx(txHash, targetAddress) {
    const trace = await hre.ethers.provider.send("debug_traceTransaction", [
        txHash,
        { tracer: "callTracer" }
    ]);

    const target = targetAddress.toLowerCase();

    function search(call) {
        if (
            (call.type === "CREATE" || call.type === "CREATE2") &&
            call.to?.toLowerCase() === target
        ) {
            return call.from; // the immediate creator, whatever level it happened at
        }
        if (call.calls) {
            for (const inner of call.calls) {
                const found = search(inner);
                if (found) return found;
            }
        }
        return null;
    }   

    return search(trace);
}

async function findTrueCreatorFromInternalTxs(txHash, targetAddress, chainId) {

    const url = `${ETHERSCAN_BASE_URL}?chainid=${chainId}&module=account&action=txlistinternal&txhash=${txHash}&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "1" || !data.result?.length) {
        return null; // no internal transactions indexed for this tx
    }

    const target = targetAddress.toLowerCase();

    const creationEntry = data.result.find(
        (entry) => entry.type === "create" && entry.contractAddress?.toLowerCase() === target
    );

    return creationEntry ? creationEntry.from : null;
}

async function fetchDeploymentInfoFromEtherscan(accountAddress, chainId, retries = 3) {

    // 1. creator address + deployment tx hash
    const creationUrl = `${ETHERSCAN_BASE_URL}?chainid=${chainId}&module=contract&action=getcontractcreation&contractaddresses=${accountAddress}&apikey=${ETHERSCAN_API_KEY}`;
    const creationRes = await fetch(creationUrl);
    const creationData = await creationRes.json();

    if (creationData.status !== "1" || !creationData.result?.length) {
        const isRateLimited = String(creationData.result).toLowerCase().includes("rate limit");
        if (isRateLimited && retries > 0) {
            console.warn(`Rate limited fetching ${accountAddress}, retrying in 1s... (${retries} left)`);
            await sleep(1000);
            return fetchDeploymentInfoFromEtherscan(accountAddress, chainId, retries - 1);
        }
        console.warn(`fetchDeploymentInfoFromEtherscan: no creation data for ${accountAddress} - status="${creationData.status}", message="${creationData.message}", result=${JSON.stringify(creationData.result)}`);
        return null;
    }

    const { contractCreator, txHash } = creationData.result[0];

    let trueCreator = contractCreator;
    try {
        await sleep(350); // throttle before next Etherscan call
        const tracedCreator = await findTrueCreatorFromInternalTxs(txHash, accountAddress, chainId);
        if (tracedCreator) {
            trueCreator = tracedCreator;
        }
    } catch (err) {
        console.warn(`Could not trace creator for ${accountAddress} from tx ${txHash}, falling back to Etherscan's reported creator. Reason: ${err.message}`);
    }

    // 2. verified source code (may be empty if contract isn't verified)
    await sleep(350); // throttle before next Etherscan call
    const sourceUrl = `${ETHERSCAN_BASE_URL}?chainid=${chainId}&module=contract&action=getsourcecode&address=${accountAddress}&apikey=${ETHERSCAN_API_KEY}`;
    const sourceRes = await fetch(sourceUrl);
    const sourceData = await sourceRes.json();
    const solidityCode = sourceData.result?.[0]?.SourceCode || null;

    // 3. block number + timestamp, from the deployment tx itself
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);

    return {
        creatorAddress: trueCreator,
        creatorChainId: chainId,
        txHashDeployment: txHash,
        blockNumberDeployment: receipt.blockNumber,
        timestampDeployment: new Date(Number(block.timestamp) * 1000),
        solidityCode
    };
}

module.exports = { fetchDeploymentInfoFromEtherscan };

/* --- test harness: only runs when this file is executed directly ---
if (require.main === module) {
    const testAddress = "0x01342ac01450b509840DfFfd3ccbf41d41098181"; // UNI token - verified, deployed on Sepolia too
    const chainId = 11155111; // Sepolia

    fetchDeploymentInfoFromEtherscan(testAddress, chainId)
        .then((result) => {
            console.log("Result:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error("Test failed:", error);
            process.exit(1);
        });
}*/