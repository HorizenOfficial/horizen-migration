const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const utils = require("./utils");

describe("Vesting setup test", function () {

  let erc20;
  let vesting;
  let initialBeneficiary;
  let newBeneficiary;
  let TIME_BETWEEN_INTERVALS = 1000;
  let INTERVALS_TO_CLAIM = 20;
  let AMOUNT_EACH_CLAIM = 10;
  let VESTING_AMOUNT = AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM + 1;
  let startTimestamp;
 
  beforeEach(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(4);
    vestingAdmin  = (await ethers.getSigners())[0];
    initialBeneficiary  = (await ethers.getSigners())[1].address;
    newBeneficiary = (await ethers.getSigners())[2].address;
  });

  async function _setTimestampAndClaimFails(claimTimestamp, errorName) {
    await time.setNextBlockTimestamp(claimTimestamp);
    await expect(vesting.claim()).to.be.revertedWithCustomError(vesting, errorName);
  }

  // tests
  it("Deployment of vesting contract", async function () {

    //deploy erc20 mock
    let ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    erc20 = await ERC20Mock.deploy();
    await erc20.deploymentTransaction().wait();

    //deploy vesting contract
    startTimestamp = await time.latest() + 10;
    factory = await ethers.getContractFactory(utils.VESTING_CONTRACT_NAME);
    vesting = await factory.deploy(vestingAdmin.address, initialBeneficiary, TIME_BETWEEN_INTERVALS, INTERVALS_TO_CLAIM);
    await vesting.deploymentTransaction().wait();
    
    expect(await vesting.token()).to.be.equal(utils.NULL_ADDRESS);
    expect(await vesting.beneficiary()).to.be.equal(initialBeneficiary);
    expect(await vesting.amountForEachClaim()).to.be.equal(0);
    expect(await vesting.startTimestamp()).to.be.equal(0);
    expect(await vesting.timeBetweenClaims()).to.be.equal(TIME_BETWEEN_INTERVALS);
    expect(await vesting.intervalsToClaim()).to.be.equal(INTERVALS_TO_CLAIM);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(0);
  });


  it("startVesting and claim fail if setErc20 was not called", async function () {
    await expect(erc20.mockStartVesting(vesting.getAddress(), VESTING_AMOUNT)).to.be.revertedWithCustomError(vesting, "UnauthorizedOperation");
    startTimestamp = startTimestamp + TIME_BETWEEN_INTERVALS + 1;
    await _setTimestampAndClaimFails(startTimestamp, "ERC20NotSet");

  });

  it("changeBeneficiary should work even if setErc20 was not called", async function () {
    
    (await vesting.changeBeneficiary(newBeneficiary)).wait();

    //Nothing will change except for the beneficiary 
    expect(await vesting.token()).to.be.equal(utils.NULL_ADDRESS);
    expect(await vesting.beneficiary()).to.be.equal(newBeneficiary);
    expect(await vesting.amountForEachClaim()).to.be.equal(0);
    expect(await vesting.startTimestamp()).to.be.equal(0);
    expect(await vesting.timeBetweenClaims()).to.be.equal(TIME_BETWEEN_INTERVALS);
    expect(await vesting.intervalsToClaim()).to.be.equal(INTERVALS_TO_CLAIM);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(0);

  });

  it("setERC20", async function () {
    await vesting.setERC20(await erc20.getAddress());
    expect(await vesting.token()).to.be.equal(await erc20.getAddress());

  });

  it("setERC20 should not be called twice", async function () {
    await expect(vesting.setERC20(await erc20.getAddress())).to.be.revertedWithCustomError(vesting, "UnauthorizedOperation");
  });

  it("claim fails if startVesting was not called", async function () {
    startTimestamp = startTimestamp + TIME_BETWEEN_INTERVALS + 1;
    await _setTimestampAndClaimFails(startTimestamp, "VestingNotStartedYet");
  });

  it("changeBeneficiary should work even if startVesting was not called", async function () {
    
    (await vesting.changeBeneficiary(initialBeneficiary)).wait();

    //Nothing will change except for the beneficiary 
    expect(await vesting.token()).to.be.equal(await erc20.getAddress());
    expect(await vesting.beneficiary()).to.be.equal(initialBeneficiary);
    expect(await vesting.amountForEachClaim()).to.be.equal(0);
    expect(await vesting.startTimestamp()).to.be.equal(0);
    expect(await vesting.timeBetweenClaims()).to.be.equal(TIME_BETWEEN_INTERVALS);
    expect(await vesting.intervalsToClaim()).to.be.equal(INTERVALS_TO_CLAIM);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(0);

  });

  it("startVesting", async function () {
    expect(await vesting.amountForEachClaim()).to.be.equal(0);
    expect(await vesting.startTimestamp()).to.be.equal(0);
    let vestingStartTime = startTimestamp + 10;
    await time.setNextBlockTimestamp(vestingStartTime);
    await erc20.mockStartVesting(vesting.getAddress(), VESTING_AMOUNT);
    
    expect(await vesting.amountForEachClaim()).to.be.equal(AMOUNT_EACH_CLAIM);
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);
  });  

  it("startVesting should not be called twice", async function () {
    await expect(erc20.mockStartVesting(vesting.getAddress(), VESTING_AMOUNT)).to.be.revertedWithCustomError(vesting, "VestingAlreadyStarted");
  });  
});