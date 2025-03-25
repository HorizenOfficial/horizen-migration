require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.27", 
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "shanghai", 
    },
  },
  defaultNetwork : "hardhat",  //hardhat is fine for local testing - uncomment below to deploy in a true network
  /*
  networks: {
    basesepolia: {
      url: "https://sepolia.base.org",
      accounts: {
        mnemonic: process.env.MNEMONIC
      }
    },
    horizenl3: {
      url: "https://horizen-rpc-testnet.appchain.base.org",
      accounts: {
        mnemonic: process.env.MNEMONIC
      }
    }
  }
  */
};

task("balances", "Prints the wallet balances", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();  
  for (var i = 0; i < 5; i++) {
    console.log(accounts[i].address);
    console.log( ethers.formatEther(await hre.ethers.provider.getBalance(accounts[i].address)));
  }
});












