require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config();
const { exit } = require("process");
const web3 = require("web3");
const fs = require("fs");
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

const EON_VAULT_CONTRACT_NAME = "ZTESTBackupVault"
const ZEN_TOKEN_CONTRACT_NAME = "ZTEST"

task("contractSetup", "To be used just for testing", async (taskArgs, hre) => {

  console.log("Deploying EONVault contract");
  const admin = (await ethers.getSigners())[0];

  let factory = await hre.ethers.getContractFactory(EON_VAULT_CONTRACT_NAME);
  let EONVault = await factory.deploy(admin);
  let res = await EONVault.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying EONVault contract failed!");
    exit(-1);
  }
  console.log(`EONVault contract deployed at: ${EONVault.target}`);

  console.log("Deploying ZENToken contract");

  const MOCK_ZEND_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
  factory = await hre.ethers.getContractFactory(ZEN_TOKEN_CONTRACT_NAME);
  ZENToken = await factory.deploy(MOCK_ZEND_VAULT_ADDRESS, await EONVault.getAddress());
  console.log(`ZENToken contract deployed at: ${ZENToken.target}`);
  res = await ZENToken.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying ZENToken contract failed!");
    exit(-1);
  }
  console.log("Set ERC-20 contract reference in the vault contract");
  res = await EONVault.setERC20(await ZENToken.getAddress());

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

  if (process.env.EON_VAULT_ADDRESS == null) {
    console.error("EON_VAULT_ADDRESS environment variable not set: missing EONVault contract address. Exiting.")
    exit(-1);
  }

  console.log("EON_VAULT_ADDRESS: " + process.env.EON_VAULT_ADDRESS);
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


  const EONVault = await hre.ethers.getContractAt(EON_VAULT_CONTRACT_NAME, process.env.EON_VAULT_ADDRESS);

  console.log("Setting final account hash on EONVault");
  let res = await EONVault.setCumulativeHashCheckpoint(finalCumAccountHash);   
  let receipt = await res.wait();
  if (receipt.status == 0) {
    console.error("Setting final account hash on EONVault failed! Failed transaction: " + res);
    exit(-1);
  }

  console.log("Setting final account hash on EONVault OK");


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
        let res = await EONVault.batchInsert(calcCumulativeHash, addressesValues);
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
      let res = await EONVault.batchInsert(calcCumulativeHash, addressesValues);
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
  let finalHash = await EONVault._cumulativeHash();
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
  while (await EONVault.moreToDistribute()) {
    console.log("Distribution round: " + round);
    let res = await EONVault.distribute();
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
  console.log("***************************************************************\n");
  let num_of_mismatches = 0;
  for (const [address, balance] of accounts) {
    let currentBalance = await ZENToken.balanceOf(address);
    if (currentBalance != balance) {
      console.log("Balance of address " + address + " different from expected - expected: " + balance + ", actual: " + currentBalance);
      num_of_mismatches++;
    }
  }

  console.log("\n***************************************************************");
  console.log("             Checking end. Mismatches found: " + num_of_mismatches);
  console.log("***************************************************************");


});












