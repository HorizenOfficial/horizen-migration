const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const utils = require("./utils");

describe("Vesting setup test", function () {

  let erc20;
  let vesting;
  let beneficiary;
  let TIME_BETWEEN_INTERVALS = 1000;
  let INTERVALS_TO_CLAIM = 20;
  let AMOUNT_EACH_CLAIM = 10;
  let VESTING_AMOUNT = AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM + 1;
  let startTimestamp;
  let admin;

  beforeEach(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(2);
    admin = (await ethers.getSigners())[0];
    beneficiary = (await ethers.getSigners())[1].address;

  });

  //helpers functions
  async function _assertBalance(expectedBalance) {
    let balance = await erc20.balanceOf(beneficiary);
    expect(balance).to.be.equal(expectedBalance);
    
    //check contract balance
    let contractBalance = await erc20.balanceOf(await vesting.getAddress());
    expect(contractBalance).to.be.equal(VESTING_AMOUNT - expectedBalance);
  }

  async function _setTimestampAndClaim(claimTimestamp) {
    await time.setNextBlockTimestamp(claimTimestamp);
    await vesting.claim();
  }

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
    factory = await ethers.getContractFactory("LinearTokenVesting");
    vesting = await factory.deploy(admin, beneficiary, TIME_BETWEEN_INTERVALS, INTERVALS_TO_CLAIM);
    await vesting.deploymentTransaction().wait();
    expect(await vesting.token()).to.be.equal(utils.NULL_ADDRESS);
    expect(await vesting.beneficiary()).to.be.equal(beneficiary);
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

  it("setERC20", async function () {

    await vesting.setERC20(await erc20.getAddress());
    expect(await vesting.token()).to.be.equal(await erc20.getAddress());

  });

  it("claim fails if startVesting was not called", async function () {
    startTimestamp = startTimestamp + TIME_BETWEEN_INTERVALS + 1;
    await _setTimestampAndClaimFails(startTimestamp, "VestingNotStartedYet");

  });
});