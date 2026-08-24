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
      url: "http://127.0.0.1:8547",
      //url: process.env.SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY]
    }
  }
};
