const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");
const utils = require("./utils");

describe("Migration Contracts Factory testing", function () {

  var admin;
  var ZenMigrationFactory;

  before(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(3);
    admin = (await ethers.getSigners())[0];
    
  });


  it("Deployment of the backup contract", async function () {
    console.log("admin: " + admin.address);
    let factory = await ethers.getContractFactory("ZenMigrationFactory");    
    ZenMigrationFactory = await factory.deploy(admin);
    console.log(`Contract deployed at: ${ZenMigrationFactory.target}`);
    const receipt = await ZenMigrationFactory.deploymentTransaction().wait(); // Wait for confirmation
    utils.printReceipt("Deploy of factory contract", receipt);
    let numOfTokens = await ZenMigrationFactory.getTokenNumber();
    expect(numOfTokens).to.equal(0);
    
  });


  it("Create first token", async function () {
    let tokenName = "NEZ"
    let tokenSymbol = "TNEZ"
   
    var res = await ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol);    
    utils.printReceipt("Create first token", await res.wait());

    let numOfTokens = await ZenMigrationFactory.getTokenNumber();
    expect(numOfTokens).to.equal(1);

    expect(tokenSymbol).to.equal(await ZenMigrationFactory.tokenSymbols(0));

    let contracts = await ZenMigrationFactory.migrationContracts(tokenSymbol);
    console.log(`Contract token deployed at: ${contracts.token}`);
    console.log(`Contract eon deployed at: ${contracts.eonVault}`);
    console.log(`Contract zend deployed at: ${contracts.zendVault}`);
  });


  it("Negative test - Create again existing token", async function () {
    let tokenName = "NEZ"
    let tokenSymbol = "TNEZ"

    await expect(ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol)).to.be.revertedWithCustomError(ZenMigrationFactory, "TokenAlreadyExists");
    
    let numOfTokens = await ZenMigrationFactory.getTokenNumber();
    expect(numOfTokens).to.equal(1);

  });

  it("Create a second token", async function () {
    let tokenName = "EZN"
    let tokenSymbol = "TEZN"
   
    var res = await ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol);    
    utils.printReceipt("Create second token", await res.wait());

    let numOfTokens = await ZenMigrationFactory.getTokenNumber();
    expect(numOfTokens).to.equal(2);

    expect(tokenSymbol).to.equal(await ZenMigrationFactory.tokenSymbols(1));

    let contracts = await ZenMigrationFactory.migrationContracts(tokenSymbol);
    console.log(`Contract token deployed at: ${contracts.token}`);
    console.log(`Contract eon deployed at: ${contracts.eonVault}`);
    console.log(`Contract zend deployed at: ${contracts.zendVault}`);
  });



  it("Set cumulative hash checkpoint on first token contracts", async function () {

    let tokenSymbol = await ZenMigrationFactory.tokenSymbols(0);
    let contracts = await ZenMigrationFactory.migrationContracts(tokenSymbol);
    const dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

    const EONVault = await hre.ethers.getContractAt(utils.EON_VAULT_CONTRACT_NAME, contracts.eonVault);
    let res = await EONVault.setCumulativeHashCheckpoint(dumpRecursiveHash);    
    utils.printReceipt("Set cumulative hash checkpoint in eon vault", await res.wait());

    const ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, contracts.zendVault);
    res = await ZENDVault.setCumulativeHashCheckpoint(dumpRecursiveHash);    
    utils.printReceipt("Set cumulative hash checkpoint in zend vault", await res.wait());

  });

  it("Check ownership", async function () {

    let non_admin = (await ethers.getSigners())[1];
    let tokenSymbol = await ZenMigrationFactory.tokenSymbols(1);
    let contracts = await ZenMigrationFactory.migrationContracts(tokenSymbol);
    const dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000011111111";

    const EONVault = await hre.ethers.getContractAt(utils.EON_VAULT_CONTRACT_NAME, contracts.eonVault);
    await expect(EONVault.connect(non_admin).setCumulativeHashCheckpoint(dumpRecursiveHash)).to.be.revertedWithCustomError(EONVault, "OwnableUnauthorizedAccount");    

    const ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, contracts.zendVault);
    await expect(ZENDVault.connect(non_admin).setCumulativeHashCheckpoint(dumpRecursiveHash)).to.be.revertedWithCustomError(ZENDVault, "OwnableUnauthorizedAccount");    

  });

  
});