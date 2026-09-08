/**
 * Always-on / cloud entrypoint for YU-SAM Power (no Hardhat required).
 *
 *   npm start
 *   node app/startProduction.js
 *
 * Env:
 *   YU_SAM_DATA_DIR=/data   (Fly volume mount — persistent ledger)
 *   SEPOLIA_RPC_URL_* / MAINNET_RPC_URL
 *   PORT / PUBLIC_MODE / PUBLIC_AI / OPENAI_API_KEY
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");

process.env.ANALYZE_UI_HOST = process.env.ANALYZE_UI_HOST || "0.0.0.0";
if (process.env.PUBLIC_MODE == null) process.env.PUBLIC_MODE = "true";
if (process.env.PUBLIC_AI == null) process.env.PUBLIC_AI = "false";
process.env.YU_SAM_DATA_DIR = process.env.YU_SAM_DATA_DIR || path.join(__dirname, "../data");

function seedPersistentDataDir() {
    const dataDir = path.resolve(process.env.YU_SAM_DATA_DIR);
    const seedDir = path.join(__dirname, "../data-seed");
    fs.mkdirSync(dataDir, { recursive: true });

    const files = ["vulnerable_contract_registry.json", "tx_risk_decisions.json", ".gitkeep"];
    for (const name of files) {
        const dest = path.join(dataDir, name);
        if (fs.existsSync(dest)) continue;
        const src = path.join(seedDir, name);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`Seeded ${name} → ${dest}`);
        }
    }
    console.log(`Persistent data dir: ${dataDir}`);
}

seedPersistentDataDir();

const { ethers } = require("ethers");
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

function main() {
    const providers = {};

    const sepoliaUrl = pickRpcUrl("sepolia");
    if (sepoliaUrl) {
        let host;
        try {
            host = new URL(sepoliaUrl).hostname;
        } catch {
            host = "sepolia-rpc";
        }
        providers.sepolia = makeStaticProvider(sepoliaUrl, 11155111, `sepolia:${host}`);
    }

    const mainnetUrl = pickRpcUrl("mainnet");
    if (mainnetUrl) {
        let host;
        try {
            host = new URL(mainnetUrl).hostname;
        } catch {
            host = "mainnet-rpc";
        }
        providers.mainnet = makeStaticProvider(mainnetUrl, 1, `mainnet:${host}`);
    }

    if (!Object.keys(providers).length) {
        console.warn(
            "WARNING: No RPC URLs configured. Paste/dataset/registry still work; tx-hash fetch needs SEPOLIA_RPC_URL_* / MAINNET_RPC_URL."
        );
    } else {
        console.log("Trace providers:", Object.keys(providers).join(", "));
    }

    setRpcProviders(providers);

    const port = Number(process.env.PORT || process.env.ANALYZE_UI_PORT || 3857);
    startServer(port);
}

main();
