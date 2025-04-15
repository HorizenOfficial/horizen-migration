const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");
const utils = require("./utils");

describe("Migration Contracts Factory testing", function () {

  var admin;
  var ZenMigrationFactory;
  const tokenName = "NEZ"
  const tokenSymbol = "TNEZ"
  const base_message = "Tityre tu patulae recubans sub tegmine fagi"
  const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";


  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    console.log("admin: " + admin.address);
    let factory = await ethers.getContractFactory("ZenMigrationFactory");
    ZenMigrationFactory = await factory.deploy(admin);
    console.log(`Contract deployed at: ${ZenMigrationFactory.target}`);
    const receipt = await ZenMigrationFactory.deploymentTransaction().wait(); // Wait for confirmation
    utils.printReceipt("Deploy of factory contract", receipt);
    expect(await ZenMigrationFactory.token()).to.be.equal(NULL_ADDRESS);
    expect(await ZenMigrationFactory.eonVault()).to.be.equal(NULL_ADDRESS);
    expect(await ZenMigrationFactory.zendVault()).to.be.equal(NULL_ADDRESS);

  });


  it("Create migration contracts", async function () {

    let res = await ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol, base_message);
    utils.printReceipt("Create migration contracts", await res.wait());
    const token = await ZenMigrationFactory.token()

    expect(token).to.be.not.equal(NULL_ADDRESS);
    const eonVault = await ZenMigrationFactory.eonVault();
    expect(eonVault).to.be.not.equal(NULL_ADDRESS);
    const zendVault = await ZenMigrationFactory.zendVault();
    expect(zendVault).to.be.not.equal(NULL_ADDRESS);

    await expect(res).to.emit(ZenMigrationFactory, 'ZenMigrationContractsCreated').withArgs(token, eonVault, zendVault);

  });


  it("Check claim message", async function () {
    let zendVault = await ZenMigrationFactory.zendVault();
    let ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, zendVault);
    expect(await ZENDVault.message_prefix()).to.be.equal(tokenSymbol + base_message);

  });

  it("Negative test - Calling again deployMigrationContracts", async function () {
    let tokenName = "FOO"
    let tokenSymbol = "FOO"

    await expect(ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol, base_message)).to.be.revertedWithCustomError(ZenMigrationFactory, "TokenAlreadyExists");
  });


  it("Set cumulative hash checkpoint on vault contracts", async function () {

    const dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

 
    let eonVault = await ZenMigrationFactory.eonVault();
    let EONVault = await hre.ethers.getContractAt(utils.EON_VAULT_CONTRACT_NAME, eonVault);
    let res = await EONVault.setCumulativeHashCheckpoint(dumpRecursiveHash);
    utils.printReceipt("Set cumulative hash checkpoint in eon vault", await res.wait());

    let zendVault = await ZenMigrationFactory.zendVault();
    let ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, zendVault);
    res = await ZENDVault.setCumulativeHashCheckpoint(dumpRecursiveHash);
    utils.printReceipt("Set cumulative hash checkpoint in zend vault", await res.wait());

  });

  it("Check ownership", async function () {

    let non_admin = (await ethers.getSigners())[1];
    const dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000011111111";

    let eonVault = await ZenMigrationFactory.eonVault();
    var EONVault = await hre.ethers.getContractAt(utils.EON_VAULT_CONTRACT_NAME, eonVault);
    await expect(EONVault.connect(non_admin).setCumulativeHashCheckpoint(dumpRecursiveHash)).to.be.revertedWithCustomError(EONVault, "OwnableUnauthorizedAccount");

    let zendVault = await ZenMigrationFactory.zendVault();
    var ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, zendVault);
    await expect(ZENDVault.connect(non_admin).setCumulativeHashCheckpoint(dumpRecursiveHash)).to.be.revertedWithCustomError(ZENDVault, "OwnableUnauthorizedAccount");

  });


});