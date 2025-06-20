require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

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

let priorityFeeInWei = process.env.PRIORITY_FEE || "100"
let maxFeeInGWei = process.env.MAX_FEE || "0.2"

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
    base: {
      url: "https://mainnet.base.org",
      accounts: accounts
    },
    basesepolia: {
      url: "https://sepolia.base.org",
      accounts: accounts
    },
    horizenl3: {
      url: (process.env.NETWORK_URL || ""),
      accounts: accounts
    },
    horizenl3_testnet: {
      url: "https://horizen-rpc-testnet.appchain.base.org/",
      accounts: accounts
    },
    test: {
      url: (process.env.NETWORK_URL || ""),
      accounts: {
        mnemonic: (process.env.MNEMONIC || "")
      }
    }
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASE_SEPOLIA_API_KEY,
      base: process.env.BASE_API_KEY,
      horizenl3_testnet: process.env.BASE_SEPOLIA_API_KEY,
    },
    customChains: [
      {
        network: "horizenl3_testnet",
        chainId: 845320009,
        urls: {
          apiURL: "https://horizen-explorer-testnet.appchain.base.org/api",
          browserURL: "https://horizen-explorer-testnet.appchain.base.org"
        }
      }
    ]
  },
  sourcify: {
     enabled: false
  },
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
const VESTING_CONTRACT_NAME = "LinearTokenVesting"

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


task("contractSetup", "Deploys ZEN migration and vesting contracts").addFlag("verify", "Executes contract verification after deployment").setAction( async (taskArgs, hre) => {

  console.log("Deploying migration factory contracts");
  if (process.env.HORIZEN_FOUNDATION_ADMIN == null) {
    console.error("HORIZEN_FOUNDATION_ADMIN environment variable not set: missing HORIZEN Foundation admin account address. Exiting.");
    exit(-1);
  }
  if (process.env.HORIZEN_FOUNDATION == null) {
    console.error("HORIZEN_FOUNDATION environment variable not set: missing HORIZEN Foundation account address. Exiting.");
    exit(-1);
  }
  if (process.env.HORIZEN_DAO_ADMIN == null) {
    console.error("HORIZEN_DAO_ADMIN environment variable not set: missing HORIZEN DAO admin account address. Exiting.");
    exit(-1);
  }
  if (process.env.HORIZEN_DAO == null) {
    console.error("HORIZEN_DAO environment variable not set: missing HORIZEN DAO account address. Exiting.");
    exit(-1);
  }

  const admin = (await ethers.getSigners())[0];


  const overrides = {
    maxPriorityFeePerGas: ethers.parseUnits(priorityFeeInWei, "wei"),
    maxFeePerGas:ethers.parseUnits(maxFeeInGWei, "gwei")
  };

  let factory = await hre.ethers.getContractFactory(ZEN_FACTORY_CONTRACT_NAME);
  let ZenMigrationFactory = await factory.deploy(admin, overrides);
  let receipt = await ZenMigrationFactory.deploymentTransaction().wait(); // Wait for confirmation

  if (receipt.status == 0) {
    console.error("Deploying migration factory contract failed!");
    exit(-1);
  }
  console.log(`Migration factory contract deployed at: ${ZenMigrationFactory.target}`);


  let tokenName = process.env.TOKEN_NAME || "ZEN"
  let tokenSymbol = process.env.TOKEN_SYMBOL || "ZEN"
  let base_message = process.env.BASE_MESSAGE || "CLAIM"

  let res = await ZenMigrationFactory.deployMigrationContracts(
    tokenName,
    tokenSymbol,
    base_message,
    process.env.HORIZEN_FOUNDATION_ADMIN,
    process.env.HORIZEN_FOUNDATION,
    process.env.HORIZEN_DAO_ADMIN,
    process.env.HORIZEN_DAO,
    overrides
  );

  receipt = await res.wait();
  if (receipt.status == 0) {
    console.error("Deploying migration contracts failed!");
    exit(-1);
  }

  console.log(`Contract EON deployed at: ${await ZenMigrationFactory.eonVault()}`);
  console.log(`Contract ZEND deployed at: ${await ZenMigrationFactory.zendVault()}`);
  console.log(`Contract token deployed at: ${await ZenMigrationFactory.token()}`);
  console.log(`Horizen Foundation Vesting Contract deployed at: ${await ZenMigrationFactory.horizenFoundationVestingContract()}`);
  console.log(`Horizen DAO Vesting Contract deployed at: ${await ZenMigrationFactory.horizenDaoVestingContract()}`);

  const ZENToken = await hre.ethers.getContractAt(ZEN_TOKEN_CONTRACT_NAME, await ZenMigrationFactory.token());
  const foundationVesting = await hre.ethers.getContractAt(VESTING_CONTRACT_NAME, await ZENToken.horizenFoundationVested());
  let foundationVestingBeneficiary = await foundationVesting.beneficiary();
  if (foundationVestingBeneficiary != process.env.HORIZEN_FOUNDATION) {
    console.error("Wrong beneficiary for Horizen Foundation Vesting Contract. Expected: " + process.env.HORIZEN_FOUNDATION + ", found: " + foundationVestingBeneficiary);
    exit(-1);
  }

  const daoVesting = await hre.ethers.getContractAt(VESTING_CONTRACT_NAME, await ZENToken.horizenDaoVested());
  let daoVestingBeneficiary = await daoVesting.beneficiary();
  if (daoVestingBeneficiary != process.env.HORIZEN_DAO) {
    console.error("Wrong beneficiary for Horizen DAO Vesting Contract. Expected: " + process.env.HORIZEN_DAO + ", found: " + daoVestingBeneficiary);
    exit(-1);
  }


  if (taskArgs.verify) {
    //Contract verification
    const ZenMigrationFactoryAddress = await ZenMigrationFactory.getAddress();
    console.log(`\n*************************************`);
    console.log(`Starting contract verification\n`);

    console.log(`------------------------`);
    console.log(`Starting Migration factory contract verification\n`);
    try {
      await hre.run("verify:verify", {
        address: ZenMigrationFactoryAddress,
        constructorArguments: [
          admin.address
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying Migration factory contract");
        console.log(error);
        exit(-1);
      }
    }
    console.log(`Migration factory contract verified\n`);


    console.log(`------------------------`);
    console.log(`Starting Zend vault contract verification\n`);
    try {
      await hre.run("verify:verify", {
        address: await ZenMigrationFactory.zendVault(),
        constructorArguments: [
          ZenMigrationFactoryAddress,
          base_message
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying Zend vault contract");
        console.log(error);
        exit(-1);
      }

    }
    console.log(`Zend vault contract verified\n`);

    console.log(`------------------------`);
    console.log(`Starting Eon vault contract verification\n`);
    try {
      await hre.run("verify:verify", {
        address: await ZenMigrationFactory.eonVault(),
        constructorArguments: [
          ZenMigrationFactoryAddress
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying Eon vault contract");
        console.log(error);
        exit(-1);
      }

    }
    console.log(`Eon vault contract verified\n`);

    console.log(`------------------------`);
    console.log(`Starting ERC20 contract verification\n`);
    try {
      await hre.run("verify:verify", {
        address: await ZenMigrationFactory.token(),
        constructorArguments: [
          tokenName,
          tokenSymbol,
          await ZenMigrationFactory.eonVault(),
          await ZenMigrationFactory.zendVault(),
          await ZenMigrationFactory.horizenFoundationVestingContract(),
          await ZenMigrationFactory.horizenDaoVestingContract()
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying ERC20 contract");
        console.log(error);
        exit(-1);
      }
    }
    console.log(`ERC20 contract verified\n`);

    console.log(`------------------------`);
    console.log(`Starting Foundation vesting contract verification\n`);
    try {

      await hre.run("verify:verify", {
        address: await ZenMigrationFactory.horizenFoundationVestingContract(),
        constructorArguments: [
          process.env.HORIZEN_FOUNDATION,
          await foundationVesting.timeBetweenClaims(),
          await foundationVesting.intervalsToClaim()
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying Foundation vesting contract");
        console.log(error);
        exit(-1);
      }

    }
    console.log(`Foundation vesting contract verified\n`);


    console.log(`------------------------`);
    console.log(`Starting DAO vesting contract verification\n`);
    try {
      await hre.run("verify:verify", {
        address: await ZenMigrationFactory.horizenDaoVestingContract(),
        constructorArguments: [
          process.env.HORIZEN_DAO,
          await daoVesting.timeBetweenClaims(),
          await daoVesting.intervalsToClaim()
        ],
      });
    }
    catch (error) {
      if (error.name != "ContractAlreadyVerifiedError") {
        console.log("Error verifying Dao vesting contract");
        console.log(error);
        exit(-1);
      }

    }
    console.log(`DAO vesting contract verified\n`);

    console.log(`Contracts verification ended\n`);
    console.log(`*************************************`);
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

  const overrides = {
    maxPriorityFeePerGas: ethers.parseUnits(priorityFeeInWei, "wei"),
    maxFeePerGas:ethers.parseUnits(maxFeeInGWei, "gwei")
  };
  console.log("Setting final account hash on EONVault");
  let res = await EONVault.setCumulativeHashCheckpoint(finalCumAccountHash, overrides);
  let receipt = await res.wait();
  if (receipt.status == 0) {
    console.error("Setting final account hash on EONVault failed! Failed transaction: " + res);
    exit(-1);
  }

  console.log("Setting final account hash on EONVault OK");


  console.log("\n\n***************************************************************");
  console.log("                      Start loading accounts");
  console.log("***************************************************************\n\n");

  const BATCH_LENGTH = 250;
  let addressesValues = [];
  let calcCumulativeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  let batchNumber = 1;
  let totalUsedGas = BigInt(0);
  let totalBalance = BigInt(0);
  let totalBatchNumber = Math.ceil(accounts.length / BATCH_LENGTH);

  for (const [address, balance] of accounts) {
    totalBalance = totalBalance + BigInt(balance);
    addressesValues.push({ addr: address, value: balance });
    calcCumulativeHash = updateEONCumulativeHash(calcCumulativeHash, address, balance);

    if (addressesValues.length == BATCH_LENGTH) {
      console.log(`Inserting batch ${batchNumber} of ${totalBatchNumber}`);
      try {
        let res = await EONVault.batchInsert(calcCumulativeHash, addressesValues, overrides);
        let receipt = await res.wait();
        totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
        console.log("Gas used: " + receipt.gasUsed);
        console.log("Cumulative gas used: " + totalUsedGas);
        if (receipt.status == 0) {
          console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
          exit(-1);
        }
        else {
          console.log(`Inserted batch ${batchNumber} of ${totalBatchNumber}`);
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
    console.log(`Inserting last batch ${batchNumber} of ${totalBatchNumber}`);
    try {
      let res = await EONVault.batchInsert(calcCumulativeHash, addressesValues, overrides);
      let receipt = await res.wait();
      totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
      console.log("Gas used: " + receipt.gasUsed);
      console.log("Cumulative gas used: " + totalUsedGas);
      if (receipt.status == 0) {
        console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
        exit(-1);
      }
      else {
        console.log(`Inserted batch ${batchNumber} of ${totalBatchNumber}`);
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
    let res = await EONVault.distribute(process.env.DISTRIBUTE_MAX_COUNT, overrides);
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
});

task("checkDistributedEON", "Checks distributed EON tokens", async (taskArgs, hre) => {

  console.log("\n\n***************************************************************");
  console.log("                 Checking distributed tokens");
  console.log("***************************************************************\n");

  const ZENToken = await hre.ethers.getContractAt(ZEN_TOKEN_CONTRACT_NAME, process.env.TOKEN_ADDRESS);
  const accounts = loadAccountsFromFile(process.env.EON_FILE);
  let mismatch_messages = [];
  let totalBalance = BigInt(0);
  let count = 1;

  for (const [address, balance] of accounts) {
    totalBalance = totalBalance + BigInt(balance);
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

  console.log("\nEON Total Restored Balance: " + totalBalance);
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


  const overrides = {
    maxPriorityFeePerGas: ethers.parseUnits(priorityFeeInWei, "wei"),
    maxFeePerGas:ethers.parseUnits(maxFeeInGWei, "gwei")
  };
  console.log("Setting final account hash on ZENDVault");
  let res = await ZENDVault.setCumulativeHashCheckpoint(finalCumAccountHash, overrides);
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
  let batchNumber = 1;
  let totalUsedGas = BigInt(0);
  let totalBalance = BigInt(0);
  let totalBatchNumber = Math.ceil(accounts.length / BATCH_LENGTH);

  for (const [address, balance] of accounts) {
    totalBalance = totalBalance + BigInt(balance);
    addressesValues.push({ addr: address, value: balance });
    calcCumulativeHash = updateZENDCumulativeHash(calcCumulativeHash, address, balance);

    if (addressesValues.length == BATCH_LENGTH) {
      console.log(`Inserting batch ${batchNumber} of ${totalBatchNumber}`);
      try {
        let res = await ZENDVault.batchInsert(calcCumulativeHash, addressesValues, overrides);
        let receipt = await res.wait();
        totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
        console.log("Gas used: " + receipt.gasUsed);
        console.log("Cumulative gas used: " + totalUsedGas);
        if (receipt.status == 0) {
          console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
          exit(-1);
        }
        else {
          console.log(`Inserted batch ${batchNumber} of ${totalBatchNumber}`);
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
    console.log(`Inserting last batch ${batchNumber} of ${totalBatchNumber}`);
    try {
      let res = await ZENDVault.batchInsert(calcCumulativeHash, addressesValues, overrides);
      let receipt = await res.wait();
      totalUsedGas = totalUsedGas + BigInt(receipt.gasUsed);
      console.log("Gas used: " + receipt.gasUsed);
      console.log("Cumulative gas used: " + totalUsedGas);
      if (receipt.status == 0) {
        console.error("Inserting batch: " + batchNumber + " failed! Failed transaction: " + res);
        exit(-1);
      }
      else {
        console.log(`Inserted batch ${batchNumber} of ${totalBatchNumber}`);
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
});

task("checkDistributedZEND", "Checks distributed ZEND tokens", async (taskArgs, hre) => {
  console.log("\n\n***************************************************************");
  console.log("                 Checking restored balances");
  console.log("***************************************************************\n");

  const ZENDVault = await hre.ethers.getContractAt(ZEND_VAULT_CONTRACT_NAME, process.env.ZEND_VAULT_ADDRESS);
  const accounts = loadAccountsFromFile(process.env.ZEND_FILE);
  let mismatch_messages = [];
  let totalBalance = BigInt(0);
  let count = 1;

  for (const [address, balance] of accounts) {
    totalBalance = totalBalance + BigInt(balance);
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
  console.log("\nZEND Total Restored Balance: " + totalBalance);
});

task("finalCheck", "Checks migration results", async (taskArgs, hre) => {
  if (process.env.TOKEN_ADDRESS == null) {
    console.error("TOKEN_ADDRESS environment variable not set: missing ZEN ERC20 token contract address. Exiting.")
    exit(-1);
  }

  if (process.env.EON_FILE == null) {
    console.error("EON_FILE environment variable not set: missing EON accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using EON accounts file: " + process.env.EON_FILE);

  if (process.env.ZEND_FILE == null) {
    console.error("ZEND_FILE environment variable not set: missing ZEND accounts file. Exiting.");
    exit(-1);
  }
  console.log("Using ZEND accounts file: " + process.env.ZEND_FILE);

  if (process.env.HORIZEN_FOUNDATION == null) {
    console.error("HORIZEN_FOUNDATION environment variable not set: missing Horizen Foundation account address. Exiting.");
    exit(-1);
  }

  if (process.env.HORIZEN_DAO == null) {
    console.error("HORIZEN_DAO environment variable not set: missing Horizen Dao account address. Exiting.");
    exit(-1);
  }

  const MAX_ZEN_SUPPLY = BigInt(21_000_000n) * BigInt(10 ** 18);
  const ZENToken = await hre.ethers.getContractAt(ZEN_TOKEN_CONTRACT_NAME, process.env.TOKEN_ADDRESS);
  const totalSupply = await ZENToken.totalSupply();

  if (totalSupply != MAX_ZEN_SUPPLY) {
    console.error("Zen tokens total supply not minted. Exiting.")
    exit(-1);
  }

  const horizenFoundationVestedAddress = await ZENToken.horizenFoundationVested();
  const foundationVesting = await hre.ethers.getContractAt(VESTING_CONTRACT_NAME, horizenFoundationVestedAddress);
  let foundationVestingBeneficiary = await foundationVesting.beneficiary();
  if (foundationVestingBeneficiary != process.env.HORIZEN_FOUNDATION) {
    console.error("Wrong beneficiary for Horizen Foundation Vesting Contract. Expected: " + process.env.HORIZEN_FOUNDATION + ", found: " + foundationVestingBeneficiary);
    exit(-1);
  }

  const horizenDaoVestedAddress = await ZENToken.horizenDaoVested();
  const daoVesting = await hre.ethers.getContractAt(VESTING_CONTRACT_NAME, horizenDaoVestedAddress);
  let daoVestingBeneficiary = await daoVesting.beneficiary();
  if (daoVestingBeneficiary != process.env.HORIZEN_DAO) {
    console.error("Wrong beneficiary for Horizen DAO Vesting Contract. Expected: " + process.env.HORIZEN_DAO + ", found: " + daoVestingBeneficiary);
    exit(-1);
  }

  var eonTotalBalance = BigInt(0);
  var zendTotalBalance = BigInt(0);
  const accounts = loadAccountsFromFile(process.env.EON_FILE);
  for (const [address, balance] of accounts) {
    eonTotalBalance = eonTotalBalance + BigInt(balance);
  }
  const accountsZend = loadAccountsFromFile(process.env.ZEND_FILE);
  for (const [address, balance] of accountsZend) {
    zendTotalBalance = zendTotalBalance + BigInt(balance);

  }
  const expectedRemainingZenSupply = MAX_ZEN_SUPPLY - zendTotalBalance - eonTotalBalance;

  const expectedDaoZenSupply = expectedRemainingZenSupply * BigInt(6) / BigInt(10);
  const expectedInitialDaoZenSupply = expectedDaoZenSupply / BigInt(4);

  let zenDaoBalance = await ZENToken.balanceOf(process.env.HORIZEN_DAO);
  console.log("Horizen DAO address balance: " + zenDaoBalance);
  if (zenDaoBalance != expectedInitialDaoZenSupply) {
    console.error("Wrong Horizen DAO balance. Expected balance: {0}, actual balance {1}", expectedInitialDaoZenSupply, zenDaoBalance);
    exit(-1);
  }

  const expectedInitialVestingDaoZenSupply = expectedDaoZenSupply - expectedInitialDaoZenSupply;
  let zenVestingDaoBalance = await ZENToken.balanceOf(horizenDaoVestedAddress);
  console.log("Horizen DAO vesting balance: " + zenVestingDaoBalance);
  if (zenVestingDaoBalance != expectedInitialVestingDaoZenSupply) {
    console.error("Wrong Horizen Dao vesting balance. Expected balance: {0}, actual balance {1}", expectedInitialVestingDaoZenSupply, zenVestingDaoBalance);
    exit(-1);
  }

  const expectedFoundationZenSupply = expectedRemainingZenSupply - expectedDaoZenSupply;
  const expectedInitialFoundationZenSupply = expectedFoundationZenSupply / BigInt(4);
  let zenFoundationBalance = await ZENToken.balanceOf(process.env.HORIZEN_FOUNDATION);
  console.log("Horizen Foundation address balance: " + zenFoundationBalance);
  if (zenFoundationBalance != expectedInitialFoundationZenSupply) {
    console.error("Wrong Horizen Foundation balance. Expected balance: {0}, actual balance {1}", expectedInitialFoundationZenSupply, zenFoundationBalance);
    exit(-1);
  }

  const expectedInitialVestingFoundationZenSupply = expectedFoundationZenSupply - expectedInitialFoundationZenSupply;
  let zenVestingFoundationBalance = await ZENToken.balanceOf(horizenFoundationVestedAddress);
  console.log("Horizen Foundation vesting balance: " + zenVestingFoundationBalance);
  if (zenVestingFoundationBalance != expectedInitialVestingFoundationZenSupply) {
    console.error("Wrong Horizen Foundation vesting balance. Expected balance: {0}, actual balance {1}", expectedInitialVestingFoundationZenSupply, zenVestingFoundationBalance);
    exit(-1);
  }

  console.log("Total balance: " + (zendTotalBalance + eonTotalBalance + zenFoundationBalance + zenVestingFoundationBalance + zenDaoBalance + zenVestingDaoBalance));
  console.log("Result: OK");
});

