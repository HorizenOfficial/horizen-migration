const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { hrtime } = require("process");


describe("Vesting test", function () {

  let erc20;
  let vesting;
  let beneficiary;
  let TIME_BETWEEN_INTERVALS = 1000;
  let INTERVALS_TO_CLAIM = 20;
  let AMOUNT_EACH_CLAIM = 10;
  let startTimestamp;

  beforeEach(async function () {
    beneficiary = (await ethers.getSigners())[0].address;

    //deploy erc20
    let factory = await ethers.getContractFactory("ZTEST");
    const MOCK_EON_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    erc20 = await factory.deploy(MOCK_EON_VAULT_ADDRESS, beneficiary);
    await erc20.deploymentTransaction().wait();

    //deploy vesting
    startTimestamp = await time.latest() + 10;
    factory = await ethers.getContractFactory("LinearTokenVesting");
    vesting = await factory.deploy(await erc20.getAddress(), beneficiary, AMOUNT_EACH_CLAIM, startTimestamp, TIME_BETWEEN_INTERVALS, INTERVALS_TO_CLAIM);
    await vesting.deploymentTransaction().wait();

    //mint
    await erc20.mint(await vesting.getAddress(), AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM);
  });

  async function _assertBalance(expectedBalance) {
    let balance = await erc20.balanceOf(beneficiary);
    expect(balance).to.be.equal(expectedBalance);
  }

  async function _setTimetampAndClaim(claimTimestamp) {
    await time.setNextBlockTimestamp(claimTimestamp);
    await vesting.claim();
  }

  async function _setTimetampAndClaimFails(claimTimestamp, errorName) {
    await time.setNextBlockTimestamp(claimTimestamp);
    expect(vesting.claim()).to.be.revertedWithCustomError(vesting, errorName);
  }

  it("TODO claim fails if no period has passed", async function () {
    await time.setNextBlockTimestamp(startTimestamp+1);
    expect(true).to.be.equal(true);
  });

  it("TODO claim success for one period in between, then a second period", async function () {
    expect(true).to.be.equal(true);
  });

  it("TODO claim success for all periods, then fails", async function () {
    expect(true).to.be.equal(true);
  });

  it("TODO claim after one period, then claim success if multiple periods has passed", async function () {
    expect(true).to.be.equal(true);
  });
});