require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config();
const { exit } = require("process");
const web3 = require("web3");
const fs = require("fs");
const JSONbig = require("json-bigint")({ storeAsString: true });

var accounts;
if (process.env.ADMIN_PRIVK) {
  accounts = [process.env.ADMIN_PRIVK];
}
else {
  accounts = {
    mnemonic: (process.env.MNEMONIC || "")
  }
}
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
  defaultNetwork: (process.env.NETWORK || "hardhat"),
  networks: {
    basesepolia: {
      url: "https://sepolia.base.org",
      accounts: accounts
    },
    horizenl3: {
      url: (process.env.NETWORK_URL || ""),
      accounts: accounts
    },
    test: {
      url: (process.env.NETWORK_URL || ""),
      accounts : {
        mnemonic: (process.env.MNEMONIC || "")
      }
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


const EON_VAULT_CONTRACT_NAME = "EONBackupVault"
const ZEND_VAULT_CONTRACT_NAME = "ZendBackupVault"
const ZEN_TOKEN_CONTRACT_NAME = "ZenToken"
const ZEN_FACTORY_CONTRACT_NAME = "ZenMigrationFactory"

function loadAccountsFromFile(fileName) {
  const jsonFile = fs.readFileSync(fileName, 'utf-8');
  const jsonData = JSONbig.parse(jsonFile);
  const accounts = Object.entries(jsonData).map(([address, balance]) => [address, balance.toString()]);
  accounts.sort((a, b) => a[0].localeCompare(b[0]));

  return accounts;
}


function updateEONCumulativeHash(previousHash, address, value) {
  const encoded = web3.eth.abi.encodeParameters(['bytes32', 'address', 'uint256'], [previousHash, address, value]);
  return web3.utils.sha3(encoded, { encoding: 'hex' })
}

function updateZENDCumulativeHash(previousHash, address, value) {
  const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'], [previousHash, address, value]);
  return web3.utils.sha3(encoded, { encoding: 'hex' })
}

function prepareCumulativeHash(accounts, hashFunc) {

  let finalCumAccountHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  for (const [address, balance] of accounts) {
    finalCumAccountHash = hashFunc(finalCumAccountHash, address, balance);
  }

  return finalCumAccountHash;
}

task("hashEON", "Calculates the final hash for EON accounts", async (taskArgs, hre) => {
  if (process.env.EON_FILE == null) {
    console.error("EON_FILE environment variable not set: missing EON accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using EON accounts file: " + process.env.EON_FILE);
  console.log("Calculating EON cumulative account hash");

  const accounts = loadAccountsFromFile(process.env.EON_FILE);
  let finalCumAccountHash = prepareCumulativeHash(accounts, updateEONCumulativeHash);

  console.log("Final EON account hash: ", finalCumAccountHash);

});

task("hashZEND", "Calculates the final hash for ZEND accounts", async (taskArgs, hre) => {
  if (process.env.ZEND_FILE == null) {
    console.error("ZEND_FILE environment variable not set: missing ZEND accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using ZEND accounts file: " + process.env.ZEND_FILE);
  console.log("Calculating ZEND cumulative account hash");

  const accounts = loadAccountsFromFile(process.env.ZEND_FILE);
  let finalCumAccountHash = prepareCumulativeHash(accounts, updateZENDCumulativeHash);

  console.log("Final ZEND account hash: ", finalCumAccountHash);

});


task("contractSetup", "To be used just for testing", async (taskArgs, hre) => {

  console.log("Deploying migration factory contract");
  const admin = (await ethers.getSigners())[0];

  let factory = await hre.ethers.getContractFactory(ZEN_FACTORY_CONTRACT_NAME);
  let ZenMigrationFactory = await factory.deploy(admin);
  let receipt = await ZenMigrationFactory.deploymentTransaction().wait(); // Wait for confirmation

  if (receipt.status == 0) {
    console.error("Deploying migration factory contract failed!");
    exit(-1);
  }
  console.log(`Migration factory contract deployed at: ${ZenMigrationFactory.target}`);


  let tokenName = "ZEN"
  let tokenSymbol = "ZEN"
  let base_message = "CLAIM"
  let res = await ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol, base_message);    

  receipt = await res.wait();
  if (receipt.status == 0) {
    console.error("Deploying migration contracts failed!");
    exit(-1);
  }
  
  console.log(`Contract EON deployed at: ${await ZenMigrationFactory.eonVault()}`);
  console.log(`Contract ZEND deployed at: ${await ZenMigrationFactory.zendVault()}`);
  console.log(`Contract token deployed at: ${await ZenMigrationFactory.token()}`);


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

  const accounts = loadAccountsFromFile(process.env.EON_FILE);
  let finalCumAccountHash = prepareCumulativeHash(accounts, updateEONCumulativeHash);

  console.log("Final account hash: ", finalCumAccountHash);

  console.log("Checking that EON final account hash is the expected one");
  if (finalCumAccountHash != process.env.EON_HASH) {
    console.error("Calculated EON final account hash doesn't match with expected hash. Expected hash: " + process.env.EON_HASH +
      ", actual hash: " + finalCumAccountHash);
    exit(-1);
  }
  console.log("\u2705 EON final account hash verified correctly");

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
      mismatch_messages.push("Balance of address " + address + " is different from expected - expected: " + balance + ", actual: " + currentBalance);
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

  const accounts = loadAccountsFromFile(process.env.ZEND_FILE);
  let finalCumAccountHash = prepareCumulativeHash(accounts, updateZENDCumulativeHash);
  console.log("Final ZEND account hash: ", finalCumAccountHash);

  console.log("Checking that ZEND final account hash is the expected one");
  if (finalCumAccountHash != process.env.ZEND_HASH) {
    console.error("Calculated ZEND final account hash doesn't match with expected hash. Expected hash: " + process.env.ZEND_HASH +
      ", actual hash: " + finalCumAccountHash);
    exit(-1);
  }
  console.log("\u2705 ZEND final account hash verified correctly");

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


