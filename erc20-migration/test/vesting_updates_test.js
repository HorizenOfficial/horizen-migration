const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const utils = require("./utils");

describe("Vesting updates test", function () {

  let erc20;
  let vesting;
  let initialBeneficiary;
  let newBeneficiary;
  let TIME_BETWEEN_INTERVALS = 1000;
  let INTERVALS_TO_CLAIM = 20;
  let AMOUNT_EACH_CLAIM = 10;
  let VESTING_AMOUNT = AMOUNT_EACH_CLAIM * INTERVALS_TO_CLAIM + 1;
  let startTimestamp;
  let vestingAdmin;

  beforeEach(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(4);
    vestingAdmin = (await ethers.getSigners())[0];
    initialBeneficiary = (await ethers.getSigners())[1].address;
    newBeneficiary = (await ethers.getSigners())[2].address;

    //deploy erc20 mock
    let ERC20Mock = await ethers.getContractFactory("ERC20Mock"); 
    erc20 = await ERC20Mock.deploy();    
    await erc20.deploymentTransaction().wait();

    //deploy vesting contract
    startTimestamp = await time.latest() + 10;
    factory = await ethers.getContractFactory(utils.VESTING_CONTRACT_NAME);
    vesting = await factory.deploy(vestingAdmin, initialBeneficiary, TIME_BETWEEN_INTERVALS, INTERVALS_TO_CLAIM);
    await vesting.deploymentTransaction().wait();

    //set ERC-20
    await vesting.setERC20(await erc20.getAddress());

    //mock start vesting
    await erc20.mockStartVesting(vesting.getAddress(), VESTING_AMOUNT);
  });

  //helpers functions
  async function _assertBalance(beneficiary, expectedBalance) {
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
  it("changeBeneficiary fails if caller is not the admin", async function () {
    let randomUser = (await ethers.getSigners())[3];
    await expect(vesting.connect(randomUser).changeBeneficiary(newBeneficiary)).to.be.revertedWithCustomError(vesting, "UnauthorizedAccount");
  });

  it("changeVestingParams fails if caller is not the admin", async function () {
    let randomUser = (await ethers.getSigners())[3];
    await expect(vesting.connect(randomUser).changeVestingParams(TIME_BETWEEN_INTERVALS + 1, INTERVALS_TO_CLAIM + 1)).to.be.revertedWithCustomError(vesting, "UnauthorizedAccount");
  });


  it("changeBeneficiary fails if new beneficiary is NULL_ADDRESS", async function () {
    await expect(vesting.changeBeneficiary(utils.NULL_ADDRESS)).to.be.revertedWithCustomError(vesting, "AddressParameterCantBeZero");
  });

  it("changeVestingParams fails if new params are 0", async function () {
    await expect(vesting.changeVestingParams(TIME_BETWEEN_INTERVALS + 1, 0)).to.be.revertedWithCustomError(vesting, "InvalidNumOfIntervals");
    await expect(vesting.changeVestingParams(0, INTERVALS_TO_CLAIM + 1)).to.be.revertedWithCustomError(vesting, "InvalidTimes");
    await expect(vesting.changeVestingParams(0, 0)).to.be.revertedWithCustomError(vesting, "UnauthorizedAccount");
  });



  it("changeBeneficiary before any claim period has passed", async function () {
    let vestingStartTime = await vesting.startTimestamp();
    let initialIntervalsAlreadyClaimed = await vesting.intervalsAlreadyClaimed();

    let initialBeneficiaryBalance = await erc20.balanceOf(initialBeneficiary);


    await time.setNextBlockTimestamp(startTimestamp + TIME_BETWEEN_INTERVALS/2);

    let res = await vesting.changeBeneficiary(newBeneficiary);
    res.wait();

    expect(await vesting.beneficiary()).to.be.equal(newBeneficiary);
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);


    await expect(res).to.emit(vesting, 'ChangedBeneficiary');
    await _setTimestampAndClaimFails(startTimestamp + TIME_BETWEEN_INTERVALS/2 + 1, "NothingToClaim");
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * 1.5);
    await _assertBalance(newBeneficiary, AMOUNT_EACH_CLAIM);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(initialIntervalsAlreadyClaimed + BigInt(1));

    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryBalance);
  });

  it("changeBeneficiary success after some periods were claimed", async function () {
    let vestingStartTime = await vesting.startTimestamp();   
    let num_of_intervals_to_claim = 2;

    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const initialBeneficiaryExpectedBalance = AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;
    
    await _assertBalance(initialBeneficiary, initialBeneficiaryExpectedBalance);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);

    (await vesting.changeBeneficiary(newBeneficiary)).wait();

    num_of_intervals_to_claim = num_of_intervals_to_claim + 1;
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryExpectedBalance);
    expect(await erc20.balanceOf(newBeneficiary)).to.be.equal(AMOUNT_EACH_CLAIM);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);
    //Checks that the other parameters were not changed with the beneficiary
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);
  });

  it("changeBeneficiary with some periods accrued by the old beneficiary not claimed yet", async function () {
    let vestingStartTime = await vesting.startTimestamp();   
    let num_of_intervals_to_claim = 2;

    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const initialBeneficiaryExpectedBalance = AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;
    
    await _assertBalance(initialBeneficiary, initialBeneficiaryExpectedBalance);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);

    const additionalIntervalsOfOldBeneficiary = 2;
    num_of_intervals_to_claim = num_of_intervals_to_claim + additionalIntervalsOfOldBeneficiary;    
    await time.setNextBlockTimestamp(startTimestamp + TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);
    (await vesting.changeBeneficiary(newBeneficiary)).wait();

    const additionalIntervalsOfNewBeneficiary = 1;
    num_of_intervals_to_claim = num_of_intervals_to_claim + additionalIntervalsOfNewBeneficiary; 
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const totalIntervalsNotClaimedYet = additionalIntervalsOfOldBeneficiary + additionalIntervalsOfNewBeneficiary;
    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryExpectedBalance);
    expect(await erc20.balanceOf(newBeneficiary)).to.be.equal(AMOUNT_EACH_CLAIM * totalIntervalsNotClaimedYet);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);
    //Checks that the other parameters were not changed with the beneficiary
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);
  });

  it("changeBeneficiary fails after ClaimCompleted", async function () {
    await _setTimestampAndClaim(startTimestamp + TIME_BETWEEN_INTERVALS * INTERVALS_TO_CLAIM + 1);
    await expect(vesting.changeBeneficiary(newBeneficiary)).to.be.revertedWithCustomError(vesting, "UnauthorizedOperation");
  });


});