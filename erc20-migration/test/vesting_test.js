const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { hrtime } = require("process");
const { start } = require("repl");


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
    
    //check contract balance
    let contractBalance = await erc20.balanceOf(await vesting.getAddress());
    expect(contractBalance).to.be.equal(AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM - expectedBalance);
  }

  async function _setTimestampAndClaim(claimTimestamp) {
    await time.setNextBlockTimestamp(claimTimestamp);
    await vesting.claim();
  }

  async function _setTimestampAndClaimFails(claimTimestamp, errorName) {
    await time.setNextBlockTimestamp(claimTimestamp);
    expect(vesting.claim()).to.be.revertedWithCustomError(vesting, errorName);
  }

  it("claim fails if no period has passed", async function () {
    await _setTimestampAndClaimFails(startTimestamp + TIME_BETWEEN_INTERVALS/2, "NothingToClaim");
  });

  it("claim success for one period in between, then a second period", async function () {
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * 1.5);
    await _assertBalance(AMOUNT_EACH_CLAIM);
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * 2);
    await _assertBalance(AMOUNT_EACH_CLAIM*2);
  });

  it("claim success for all periods, then fails", async function () {
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * INTERVALS_TO_CLAIM);
    await _assertBalance(AMOUNT_EACH_CLAIM * INTERVALS_TO_CLAIM);
    await _setTimestampAndClaimFails(startTimestamp + TIME_BETWEEN_INTERVALS * (INTERVALS_TO_CLAIM+1), "ClaimCompleted");
  });

  it("claim success for all periods without claiming more after a long time", async function () {
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS*2); //claim two
    await _assertBalance(AMOUNT_EACH_CLAIM*2);
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * (INTERVALS_TO_CLAIM+100)); //claim after a long time
    await _assertBalance(AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM);
  });

  it("claim after one period, then claim success if multiple periods has passed", async function () {
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * 1.5);
    await _assertBalance(AMOUNT_EACH_CLAIM);
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * 5.5);
    await _assertBalance(AMOUNT_EACH_CLAIM*5);
  });
});