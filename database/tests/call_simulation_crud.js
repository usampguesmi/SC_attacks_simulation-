const { createSimulation } =
    require("../repositories/simulation_crud.js");

const hre = require("hardhat");
const hardhatPackage = require("hardhat/package.json");

async function main() {

    const network = await hre.ethers.provider.getNetwork();
    const environment = "Hardhat";
    const chainId = Number(network.chainId);
    const solidityVersion =
        hre.config.solidity.compilers[0].version;
    const hardhatVersion =
        hardhatPackage.version;
    const evmHardfork =
        hre.config.networks.hardhat.hardfork;
    const attackName =
        "sf_reentrancy";

    console.log("Environment:", environment);
    console.log("Chain ID:", chainId);
    console.log("Solidity version:", solidityVersion);
    console.log("Hardhat version:", hardhatVersion);
    console.log("EVM hardfork:", evmHardfork);
    console.log("Attack:", attackName);


    const simulationId = await createSimulation(
        solidityVersion,
        environment,
        chainId,
        attackName,
        hardhatVersion,
        evmHardfork,
        
    );

    console.log("********* Simulation saved! *********");
    console.log(" ********* Simulation ID: *********", simulationId);
}


main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });