require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config();
const { exit } = require("process");
const web3 = require("web3");
const fs = require("fs");
const path = require("path");
const JSONbig = require("json-bigint")({ storeAsString: true });


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
  defaultNetwork: process.env.NETWORK,
  networks: {
    basesepolia: {
      url: "https://sepolia.base.org",
      accounts: [process.env.ADMIN_PRIVK]
    },
    horizenl3: {
      url: process.env.NETWORK_URL,
      accounts: [process.env.ADMIN_PRIVK]
    }
  }

};

task("balances", "Prints the wallet balances", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();
  for (var i = 0; i < 5; i++) {
    console.log(accounts[i].address);
    console.log(ethers.formatEther(await hre.ethers.provider.getBalance(accounts[i].address)));
  }
});

function updateCumulativeHash(previousHash, address, value) {
  //the following hashing algorithm produces the same output as the one used in solidity
  const encoded = web3.eth.abi.encodeParameters(['bytes32', 'address', 'uint256'], [previousHash, address, value])
  return web3.utils.sha3(encoded, { encoding: 'hex' })
}

const ZEN_VAULT_CONTRACT_NAME = "ZTESTBackupVault"
const ZEN_TOKEN_CONTRACT_NAME = "ZTEST"

task("contractSetup", "To be used just for testing", async (taskArgs, hre) => {

  if (process.env.EON_FILE == null) {
    console.error("EON_FILE environment variable not set: missing EON accounts file. Exiting.");
    exit(-1);
  }

  console.log("Using EON accounts file: " + process.env.EON_FILE);
  const jsonFile = fs.readFileSync(process.env.EON_FILE, 'utf-8');
  const jsonData = JSONbig.parse(jsonFile);
  const accounts = Object.entries(jsonData).map(([address, balance]) => [address, balance.toString()]);

  /*********************** To BE removed**************************************** */
  let finalCumAccountHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  for (const [address, balance] of accounts) {
    finalCumAccountHash = updateCumulativeHash(finalCumAccountHash, address, balance);
  }
  console.log("Final account hash: ", finalCumAccountHash);

  console.log("Deploying ZENVault contract");
  const admin = (await ethers.getSigners())[0];

  let factory = await hre.ethers.getContractFactory(ZEN_VAULT_CONTRACT_NAME);
  let ZENVault = await factory.deploy(admin, finalCumAccountHash);
  let res = await ZENVault.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying ZENVault contract failed!");
    exit(-1);
  }
  console.log(`ZENVault contract deployed at: ${ZENVault.target}`);

  console.log("Deploying ZENToken contract");

  factory = await hre.ethers.getContractFactory(ZEN_TOKEN_CONTRACT_NAME);
  ZENToken = await factory.deploy(await ZENVault.getAddress());
  console.log(`ZENToken contract deployed at: ${ZENToken.target}`);
  res = await ZENToken.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying ZENToken contract failed!");
    exit(-1);
  }
  console.log("Set ERC-20 contract reference in the vault contract");
  res = await ZENVault.setERC20(await ZENToken.getAddress());

  if (res.status == 0) {
    console.error("Setting ERC-20 contract reference in the vault contract failed!");
    exit(-1);
  }
});

task("restoreEON", "Restores EON accounts", async (taskArgs, hre) => {

  if (process.env.EON_FILE == null) {
    console.error("EON_FILE environment variable not set: missing EON accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using EON accounts file: " + process.env.EON_FILE);

  if (process.env.VAULT_ADDRESS == null) {
    console.error("VAULT_ADDRESS environment variable not set: missing ZENVault contract address. Exiting.")
    exit(-1);
  }

  console.log("VAULT_ADDRESS: " + process.env.VAULT_ADDRESS);
  if (process.env.TOKEN_ADDRESS == null) {
    console.error("TOKEN_ADDRESS environment variable not set: missing ZEN ERC20 token contract address. Exiting.")
    exit(-1);
  }
  console.log("TOKEN_ADDRESS: " + process.env.TOKEN_ADDRESS);

  console.log("Calculating cumulative account hash");

  const jsonFile = fs.readFileSync(process.env.EON_FILE, 'utf-8');
  const jsonData = JSONbig.parse(jsonFile);
  const accounts = Object.entries(jsonData).map(([address, balance]) => [address, balance.toString()]);

  let finalCumAccountHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  for (const [address, balance] of accounts) {
    finalCumAccountHash = updateCumulativeHash(finalCumAccountHash, address, balance);
  }
  console.log("Final account hash: ", finalCumAccountHash);


  const ZENVault = await hre.ethers.getContractAt(ZEN_VAULT_CONTRACT_NAME, process.env.VAULT_ADDRESS);
  /*************************************************************** */
  // Set of cumulative hash on vault. TBD
  /*************************************************************** */

  console.log("\n\n***************************************************************");
  console.log("                      Start loading accounts");
  console.log("***************************************************************\n\n");

  const BATCH_LENGTH = 500;
  let addressesValues = [];
  let calcCumulativeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  let batchNumber = 0;
  let totalUsedGas = BigInt(0);

  for (const [address, balance] of accounts) {
    addressesValues.push({ addr: address, value: balance });
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, address, balance);
    if (addressesValues.length == BATCH_LENGTH) {
      console.log("Inserting batch: " + batchNumber);
      try {
        let res = await ZENVault.batchInsert(calcCumulativeHash, addressesValues);
        let receipt = await res.wait();
        totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
        console.log("Gas used: " + receipt.gasUsed);
        console.log("Cumulative gas used: " + totalUsedGas);
        if (receipt.status == 0) {
          console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
          exit(-1);
        }
        else {
          console.log("Inserted batch " + batchNumber);
        }
      }
      catch (error) {
        console.log("Error inserting batch " + batchNumber);
        console.log(error);
        exit(-1);
      }
      batchNumber++;
      addressesValues = [];
    }
  }
  if (addressesValues.length > 0) {
    console.log("Inserting last batch, number: " + batchNumber);
    try {
      let res = await ZENVault.batchInsert(calcCumulativeHash, addressesValues);
      let receipt = await res.wait();
      totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
      console.log("Gas used: " + receipt.gasUsed);
      console.log("Cumulative gas used: " + totalUsedGas);
      if (receipt.status == 0) {
        console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
        exit(-1);
      }
      else {
        console.log("Inserted last batch: " + batchNumber);
      }
    }
    catch (error) {
      console.log("Error inserting batch: " + batchNumber);
      console.log(error);
      exit(-1);
    }
  }

  console.log("Checking final hash");
  let finalHash = await ZENVault._cumulativeHash();
  if (finalHash != finalCumAccountHash) {
    console.log("Wrong final account hash. Expected: " + finalCumAccountHash + ", actual: " + finalHash);
    exit(-1);
  }
  console.log("Correct final hash reached");

  console.log("End loading accounts");


  console.log("\n\n***************************************************************");
  console.log("                   Start distributing tokens");
  console.log("***************************************************************\n\n");
  let round = 0;
  while (await ZENVault.moreToDistribute()) {
    console.log("Distribution round: " + round);
    let res = await ZENVault.distribute();
    let receipt = await res.wait();
    totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
    console.log("Gas used: " + receipt.gasUsed);
    console.log("Cumulative gas used: " + totalUsedGas);
    if (receipt.status == 0) {
      console.error("Distributing transaction failed at round " + round + "! Failed transaction: " + res);
      exit(-1);
    }
    else {
      console.log("Distributed round: " + round);
    }
    round++;
  }

  //check distributed balances
  const ZENToken = await hre.ethers.getContractAt(ZEN_TOKEN_CONTRACT_NAME, process.env.TOKEN_ADDRESS);

  console.log("\n\n***************************************************************");
  console.log("                 Checking distributed tokens");
  console.log("***************************************************************\n\n");
  for (const [address, balance] of accounts) {
    let currentBalance = await ZENToken.balanceOf(address);
    if (currentBalance != balance)
      console.log("Balance of address " + address + " different from expected - expected: " + balance + ", actual: " + currentBalance);
  }

  console.log("\n\n***************************************************************");
  console.log("                        Checking end");
  console.log("***************************************************************\n\n");


});












