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

const EON_VAULT_CONTRACT_NAME = "ZTESTBackupVault"
const ZEND_VAULT_CONTRACT_NAME = "ZTESTZendBackupVault"
const ZEN_TOKEN_CONTRACT_NAME = "ZTEST"

function updateEONCumulativeHash(previousHash, address, value) {
  const encoded = web3.eth.abi.encodeParameters(['bytes32', 'address', 'uint256'], [previousHash, address, value])
  return web3.utils.sha3(encoded, { encoding: 'hex' })
}

function updateZENDCumulativeHash(previousHash, address, value) {
  const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'], [previousHash, address, value])
  return web3.utils.sha3(encoded, { encoding: 'hex' })
}

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
  console.log("Deploying ZENDVault contract");
  factory = await hre.ethers.getContractFactory(ZEND_VAULT_CONTRACT_NAME);
  let ZENDVault = await factory.deploy(admin);
  res = await ZENDVault.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying ZENDVault contract failed!");
    exit(-1);
  }
  console.log(`ZENDVault contract deployed at: ${ZENDVault.target}`);


  console.log("Deploying ZENToken contract");
  factory = await hre.ethers.getContractFactory(ZEN_TOKEN_CONTRACT_NAME);
  ZENToken = await factory.deploy(await ZENDVault.getAddress(), await EONVault.getAddress());
  console.log(`ZENToken contract deployed at: ${ZENToken.target}`);
  res = await ZENToken.deploymentTransaction().wait(); // Wait for confirmation

  if (res.status == 0) {
    console.error("Deploying ZENToken contract failed!");
    exit(-1);
  }

  console.log("Set ERC-20 contract reference in the EON vault contract");
  res = await EONVault.setERC20(await ZENToken.getAddress());
  if (res.status == 0) {
    console.error("Setting ERC-20 contract reference in the EON vault contract failed!");
    exit(-1);
  }

  console.log("Set ERC-20 contract reference in the ZEND vault contract");
  res = await ZENDVault.setERC20(await ZENToken.getAddress());

  if (res.status == 0) {
    console.error("Setting ERC-20 contract reference in the ZENDVault vault contract failed!");
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
    finalCumAccountHash = updateEONCumulativeHash(finalCumAccountHash, address, balance);
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
    calcCumulativeHash = updateEONCumulativeHash(calcCumulativeHash, address, balance);
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
  let mismatch_messages = [];
  let count = 1;
  for (const [address, balance] of accounts) {
    const progressPercentage = Math.floor(count / accounts.length * 100);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Progress: ${progressPercentage}%`);
    let currentBalance = await ZENToken.balanceOf(address);
    if (currentBalance != balance) {
      mismatch_messages.push("Balance of address " + address + " different from expected - expected: " + balance + ", actual: " + currentBalance);
    }
    count++;
  }

  console.log("\n***************************************************************");
  console.log("             Checking end. Mismatches found: " + mismatch_messages.length);
  if (mismatch_messages.length > 0) {
    for (msg of mismatch_messages)
      console.log(msg);
  }
  console.log("***************************************************************");


});

task("restoreZEND", "Restores ZEND accounts", async (taskArgs, hre) => {

  if (process.env.ZEND_FILE == null) {
    console.error("ZEND_FILE environment variable not set: missing ZEND accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using ZEND accounts file: " + process.env.ZEND_FILE);

  if (process.env.ZEND_VAULT_ADDRESS == null) {
    console.error("ZEND_VAULT_ADDRESS environment variable not set: missing ZENDVault contract address. Exiting.")
    exit(-1);
  }

  console.log("ZEND_VAULT_ADDRESS: " + process.env.ZEND_VAULT_ADDRESS);

  console.log("Calculating cumulative account hash");

  const jsonFile = fs.readFileSync(process.env.ZEND_FILE, 'utf-8');
  const jsonData = JSONbig.parse(jsonFile);
  const accounts = Object.entries(jsonData).map(([address, balance]) => [address, balance.toString()]);

  let finalCumAccountHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  for (const [address, balance] of accounts) {
    finalCumAccountHash = updateZENDCumulativeHash(finalCumAccountHash, address, balance);
  }
  console.log("Final account hash: ", finalCumAccountHash);


  const ZENDVault = await hre.ethers.getContractAt(ZEND_VAULT_CONTRACT_NAME, process.env.ZEND_VAULT_ADDRESS);

  console.log("Setting final account hash on ZENDVault");
  let res = await ZENDVault.setCumulativeHashCheckpoint(finalCumAccountHash);   
  let receipt = await res.wait();
  if (receipt.status == 0) {
    console.error("Setting final account hash on ZENDVault failed! Failed transaction: " + res);
    exit(-1);
  }

  console.log("Setting final account hash on ZENDVault OK");

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
    calcCumulativeHash = updateZENDCumulativeHash(calcCumulativeHash, address, balance);
    if (addressesValues.length == BATCH_LENGTH) {
      console.log("Inserting batch: " + batchNumber);
      try {
        let res = await ZENDVault.batchInsert(calcCumulativeHash, addressesValues);
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
      let res = await ZENDVault.batchInsert(calcCumulativeHash, addressesValues);
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
  let finalHash = await ZENDVault._cumulativeHash();
  if (finalHash != finalCumAccountHash) {
    console.log("Wrong final account hash. Expected: " + finalCumAccountHash + ", actual: " + finalHash);
    exit(-1);
  }
  console.log("Correct final hash reached");

  console.log("End loading accounts");

  //check restored balances

  console.log("\n\n***************************************************************");
  console.log("                 Checking restored balances");
  console.log("***************************************************************\n");
  let mismatch_messages = [];
  let count = 1;
  for (const [address, balance] of accounts) {
    const progressPercentage = Math.floor(count / accounts.length * 100);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Progress: ${progressPercentage}%`);
    let currentBalance = await ZENDVault.balances(address);
    if (currentBalance != balance) {
      mismatch_messages.push("Balance of address " + address + " different from expected - expected: " + balance + ", actual: " + currentBalance);
    }
    count++;
  }

  console.log("\n***************************************************************");
  console.log("             Checking end. Mismatches found: " + mismatch_messages.length);
  if (mismatch_messages.length > 0) {
    for (msg of mismatch_messages)
      console.log(msg);
  }
  console.log("***************************************************************");


});











