const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");

describe("Token and EON Backup contract testing", function () {

  var admin;
  var ZTESTBackupVault;
  var erc20;
  var dumpRecursiveHash;
  var tuples;

  const BATCH_LENGTH = 500;

  before(async function () {
    //load dump tuples from json file into memory
    const jsonFile = fs.readFileSync(path.join(__dirname, "dump.json")).toString('utf-8');
    const jsonData = JSONbig.parse(jsonFile);
    tuples = Object.entries(jsonData).map(([key, value]) => [key, value.toString()]);  
  });

  function updateCumulativeHash(previousHash, address, value){
    //the following hashing algorithm produces the same output as the one used in solidity
    const encoded = web3.eth.abi.encodeParameters(['bytes32', 'address', 'uint256'],[previousHash, address, value])
    return web3.utils.sha3(encoded, {encoding: 'hex'})
  }

  it("Calculate locally the dump recursive hash", async function () {
    dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    for (const [key, value] of tuples) {
      dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, key, value);
    }
    console.log("Hash computed locally:", dumpRecursiveHash);
  });  

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory("ZTESTBackupVault");    
    ZTESTBackupVault = await factory.deploy(admin);
    console.log(`Contract deployed at: ${ZTESTBackupVault.target}`);
    const receipt = await ZTESTBackupVault.deploymentTransaction().wait(); // Wait for confirmation
    printReceipt("Deploy of backup contract",receipt);
  });

  it("Set cumulative hash checkpoint in the backup contract", async function () {
    var res = await ZTESTBackupVault.setCumulativeHashCheckpoint(dumpRecursiveHash);    
    printReceipt("Set cumulative hash checkpoint in vault", await res.wait());
  });

  it("Store backup balances in the contract (in batches of "+BATCH_LENGTH+")", async function () {
    var addressesValues = [];
    var calcCumulativeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    var batchNumber = 0;
    for (const [key, val] of tuples) {
      addressesValues.push({addr: key, value: val});
      calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, key, val);
      if (addressesValues.length == BATCH_LENGTH){
        console.log("Inserting batch: "+batchNumber);
        var res = await ZTESTBackupVault.batchInsert(calcCumulativeHash, addressesValues);
        printReceipt("Batch insert "+batchNumber, await res.wait());
        batchNumber++;
        addressesValues = [];
      }
    }
    if (addressesValues.length > 0){
      console.log("Inserting batch: "+batchNumber);
      var res = await ZTESTBackupVault.batchInsert(calcCumulativeHash, addressesValues);
      printReceipt("Batch insert "+batchNumber, await res.wait());
    }
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZTESTBackupVault._cumulativeHash();
    console.log("Hash from the contract: "+cumulativeHashFromContract);
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });  

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory("ZTEST");
    const MOCK_ZEND_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    erc20 = await factory.deploy(await ZTESTBackupVault.getAddress(), MOCK_ZEND_VAULT_ADDRESS);
    const receipt = await erc20.deploymentTransaction().wait(); // Wait for confirmation
    printReceipt("Deploy of ERC-20 contract",receipt);
  });

  it("Set ERC-20 contract reference in the backup contract", async function () {
    var res = await ZTESTBackupVault.setERC20(await erc20.getAddress());    
    printReceipt("Set ERC-20 reference in vault", await res.wait());
  });

  it("Call distribute() and check distributed balances", async function () {
    var round = 0;
    while (await ZTESTBackupVault.moreToDistribute()){
      console.log("distribution round: "+round);
      var res = await ZTESTBackupVault.distribute(); 
      printReceipt("Distribution round "+round, await res.wait());
      round++; 
    }
     
    //check distributed balances
    for (const [key, value] of tuples) {
      expect(await erc20.balanceOf(key)).to.equal(value);
    }
  });

  it("If we have distributed everything, no more distribution can happen", async function () {
    expect(ZTESTBackupVault.distribute()).to.be.revertedWith("Nothing to distribute");
  });

  function printReceipt(name, receipt){
    console.log(">>>> "+name);
    const gasUsed = receipt.gasUsed; // Gas units consumed
    const gasPrice = receipt.gasPrice; // Gas price in wei per unit
    const totalGasCost = gasUsed * gasPrice; // Total cost in wei
    console.log(`Tx hash: ${receipt.hash}`);
    console.log(`Gas Used: ${gasUsed}`);
    console.log(`Gas Price: ${gasPrice}`);
    console.log(`Total Gas Cost: ${ethers.formatEther(totalGasCost)} ETH`);
  }
  
});