require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      mining: { auto: true }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    sepolia: {
      //url: "http://127.0.0.1:8547",
      url: process.env.SEPOLIA_RPC_URL_PREIMUM || process.env.SEPOLIA_RPC_URL_PREMIUM || process.env.SEPOLIA_RPC_URL_FREE,
      chainId: 11155111,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY]
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || process.env.ETH_MAINNET_RPC_URL || process.env.MAINNET_RPC_URL_PREMIUM || process.env.MAINNET_RPC_URL_FREE,
      chainId: 1,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : []
    }
  }
};
