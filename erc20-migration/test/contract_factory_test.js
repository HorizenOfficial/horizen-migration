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

  before(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(3);
    admin = (await ethers.getSigners())[0];

  });


  it("Deployment of the Factory contract", async function () {
    console.log("admin: " + admin.address);
    let factory = await ethers.getContractFactory("ZenMigrationFactory");
    ZenMigrationFactory = await factory.deploy(admin);
    console.log(`Factory contract deployed at: ${ZenMigrationFactory.target}`);
    const receipt = await ZenMigrationFactory.deploymentTransaction().wait(); // Wait for confirmation
    expect(await ZenMigrationFactory.token()).to.be.equal(utils.NULL_ADDRESS);
    expect(await ZenMigrationFactory.eonVault()).to.be.equal(utils.NULL_ADDRESS);
    expect(await ZenMigrationFactory.zendVault()).to.be.equal(utils.NULL_ADDRESS);
  });


  it("Create migration contracts", async function () {

    let res = await ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol, base_message, 
        utils.HORIZEN_FOUNDATION, utils.HORIZEN_DAO);
    const token = await ZenMigrationFactory.token()


    expect(token).to.be.not.equal(utils.NULL_ADDRESS);
    const eonVault = await ZenMigrationFactory.eonVault();
    expect(eonVault).to.be.not.equal(utils.NULL_ADDRESS);
    const zendVault = await ZenMigrationFactory.zendVault();
    expect(zendVault).to.be.not.equal(utils.NULL_ADDRESS);

    const horizenFoundationVestingContract = await ZenMigrationFactory.horizenFoundationVestingContract();
    expect(horizenFoundationVestingContract).to.be.not.equal(utils.NULL_ADDRESS);

    let vestingFoundation = await hre.ethers.getContractAt(utils.VESTING_CONTRACT_NAME, horizenFoundationVestingContract);
    expect(await vestingFoundation.beneficiary()).to.be.equal(utils.HORIZEN_FOUNDATION);

    const horizenDaoVestingContract = await ZenMigrationFactory.horizenDaoVestingContract();
    expect(horizenDaoVestingContract).to.be.not.equal(utils.NULL_ADDRESS);

    let vestingDAO = await hre.ethers.getContractAt(utils.VESTING_CONTRACT_NAME, horizenDaoVestingContract);
    expect(await vestingDAO.beneficiary()).to.be.equal(utils.HORIZEN_DAO);

    await expect(res).to.emit(ZenMigrationFactory, 'ZenMigrationContractsCreated')
    .withArgs(token, eonVault, zendVault, horizenFoundationVestingContract, horizenDaoVestingContract);
  });


  it("Check token contract", async function () {
    let token = await ZenMigrationFactory.token();
    let ZENToken = await hre.ethers.getContractAt(utils.ZEN_TOKEN_CONTRACT_NAME, token);

    expect(await ZENToken.name()).to.be.equal(tokenName);
    expect(await ZENToken.symbol()).to.be.equal(tokenSymbol);

  });


  it("Check claim message", async function () {
    let zendVault = await ZenMigrationFactory.zendVault();
    let ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, zendVault);
    expect(await ZENDVault.message_prefix()).to.be.equal(tokenSymbol + base_message);

  });


  it("Negative test - Calling again deployMigrationContracts", async function () {
    let tokenName = "FOO"
    let tokenSymbol = "FOO"

    await expect(ZenMigrationFactory.deployMigrationContracts(tokenName, tokenSymbol, base_message, 
      utils.HORIZEN_FOUNDATION, utils.HORIZEN_DAO
    )).to.be.revertedWithCustomError(ZenMigrationFactory, "ContractsAlreadyDeployed");
  });


  it("Set cumulative hash checkpoint on vault contracts", async function () {

    const dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

    let eonVault = await ZenMigrationFactory.eonVault();
    let EONVault = await hre.ethers.getContractAt(utils.EON_VAULT_CONTRACT_NAME, eonVault);
    let res = await EONVault.setCumulativeHashCheckpoint(dumpRecursiveHash);

    let zendVault = await ZenMigrationFactory.zendVault();
    let ZENDVault = await hre.ethers.getContractAt(utils.ZEND_VAULT_CONTRACT_NAME, zendVault);
    res = await ZENDVault.setCumulativeHashCheckpoint(dumpRecursiveHash);

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