const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");

describe("Token and Backup contract testing", function () {

  var admin;
  var ZTESTBackupVault;
  var erc20;
  var dumpRecursiveHash;
  var tuples;

  before(async function () {
    //load dump tuples from json file into memory
    const jsonFile = fs.readFileSync(path.join(__dirname, "dump.json")).toString('utf-8');
    const jsonData = JSONbig.parse(jsonFile);
    tuples = Object.entries(jsonData).map(([key, value]) => [key, value.toString()]);  
  });

  it("Calculate locallly the dump recursive hash", async function () {
    dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    for (const [key, value] of tuples) {
      //the following hashing algorithm produces the same output as the one used in solidity
      const encoded = web3.eth.abi.encodeParameters(['bytes32', 'address', 'uint256'],[dumpRecursiveHash, key, value])
      dumpRecursiveHash = web3.utils.sha3(encoded, {encoding: 'hex'})
    }
    console.log("Hash computed locally:", dumpRecursiveHash);
  });  

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory("ZTESTBackupVault");    
    ZTESTBackupVault = await factory.deploy(admin, dumpRecursiveHash);
  });

  it("Store backup balances in the contract (in batches of 5)", async function () {
    var addresses = [];
    var balances = [];
    var batchNumber = 0;
    for (const [key, value] of tuples) {
      addresses.push(key);
      balances.push(value);
      if (addresses.length == 5){
        console.log("Inserting batch: "+batchNumber);
        await ZTESTBackupVault.batchInsert(batchNumber, addresses, balances);
        batchNumber++;
        addresses = [];
        balances = [];
      }
    }
    if (addresses.length>0){
      console.log("Inserting batch: "+batchNumber);
      await ZTESTBackupVault.batchInsert(batchNumber, addresses, balances);
    }
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZTESTBackupVault.getCumulativeHash();
    console.log("Hash from the contract: "+cumulativeHashFromContract);
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });  

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory("ZTEST");
    erc20 = await factory.deploy(await ZTESTBackupVault.getAddress());
  });

  it("Set ERC-20 contract reference in the backup contract", async function () {
    await ZTESTBackupVault.setERC20(await erc20.getAddress());    
  });

  it("Call distribute() and check distributed balances", async function () {
    var round = 0;
    while (await ZTESTBackupVault.moreToDistribute()){
      console.log("distribution round: "+round);
      await ZTESTBackupVault.distribute(); 
      round++; 
    }
     
    //check distributed balances
    for (const [key, value] of tuples) {
      expect(await erc20.balanceOf(key)).to.equal(value);
    }
  });

  it("If we have distrubuted everything, no more distribution can happen", async function () {
    expect(ZTESTBackupVault.distribute()).to.be.revertedWith("Nothing to distribute");
  });
  
});