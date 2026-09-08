/**
 * Hardhat entrypoint for the analyzer UI.
 * Registers Sepolia (Hardhat provider) and Mainnet (ethers + MAINNET_RPC_URL).
 *
 *   npm run analyze-ui
 *   → npx hardhat run app/startAnalyzeUi.js --network sepolia
 */
const { ethers } = require("ethers");
const hre = require("hardhat");
const { setRpcProviders, pickRpcUrl } = require("./analyze.js");
const { startServer } = require("./server.js");

function makeStaticProvider(rpcUrl, chainId, label) {
    return {
        provider: new ethers.JsonRpcProvider(rpcUrl, undefined, {
            staticNetwork: ethers.Network.from(chainId)
        }),
        label
    };
}

async function main() {
    const providers = {
        sepolia: {
            provider: hre.ethers.provider,
            label: `hardhat:${hre.network.name}`
        }
    };

    const mainnetUrl = pickRpcUrl("mainnet");
    if (mainnetUrl) {
        let host;
        try {
            host = new URL(mainnetUrl).hostname;
        } catch {
            host = "mainnet-rpc";
        }
        providers.mainnet = makeStaticProvider(mainnetUrl, 1, `mainnet:${host}`);
        console.log(`Trace providers: sepolia (Hardhat) + mainnet (${host})`);
    } else {
        console.log(
            'Trace provider: sepolia only. Set MAINNET_RPC_URL in .env to enable mainnet hashes.'
        );
    }

    setRpcProviders(providers);
    startServer(Number(process.env.ANALYZE_UI_PORT || 3857));
    await new Promise(() => {});
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
