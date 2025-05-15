const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const utils = require("./utils");

describe("Vesting updates test", function () {

  let erc20;
  let vesting;
  let initialBeneficiary;
  let newBeneficiary;
  let INITIAL_TIME_BETWEEN_INTERVALS = 1000;
  let INITIAL_INTERVALS_TO_CLAIM = 20;
  let INITIAL_AMOUNT_EACH_CLAIM = 10;
  let VESTING_AMOUNT = INITIAL_AMOUNT_EACH_CLAIM * INITIAL_INTERVALS_TO_CLAIM + 1;
  let startTimestamp;
  let vestingOwner;

  beforeEach(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(5);
    vestingOwner = (await ethers.getSigners())[0];
    initialBeneficiary = (await ethers.getSigners())[1].address;
    newBeneficiary = (await ethers.getSigners())[2].address;

    //deploy erc20 mock
    let ERC20Mock = await ethers.getContractFactory("ERC20Mock"); 
    erc20 = await ERC20Mock.deploy();    
    await erc20.deploymentTransaction().wait();

    //deploy vesting contract
    startTimestamp = await time.latest() + 10;
    factory = await ethers.getContractFactory(utils.VESTING_CONTRACT_NAME);
    vesting = await factory.deploy(initialBeneficiary, INITIAL_TIME_BETWEEN_INTERVALS, INITIAL_INTERVALS_TO_CLAIM);
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
    expect(contractBalance).to.be.equal(BigInt(VESTING_AMOUNT) - BigInt(expectedBalance));
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
  it("transferOwnership fails if called more than once", async function () {
    let randomUser1 = (await ethers.getSigners())[3];
    (await vesting.transferOwnership(randomUser1)).wait();
    expect(await vesting.owner()).to.be.equal(randomUser1);
    let randomUser2 = (await ethers.getSigners())[4];
    await expect(vesting.connect(randomUser1).transferOwnership(randomUser2)).to.be.revertedWithCustomError(vesting, "ImmutableOwner");
  });

  it("changeBeneficiary fails if caller is not the owner", async function () {
    let randomUser = (await ethers.getSigners())[3];
    await expect(vesting.connect(randomUser).changeBeneficiary(newBeneficiary)).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount").withArgs(randomUser);
  });

  it("changeBeneficiary fails if new beneficiary is NULL_ADDRESS", async function () {
    await expect(vesting.changeBeneficiary(utils.NULL_ADDRESS)).to.be.revertedWithCustomError(vesting, "AddressParameterCantBeZero");
  });

  it("changeBeneficiary success before any claim period has passed", async function () {
    let vestingStartTime = await vesting.startTimestamp();
    let initialIntervalsAlreadyClaimed = await vesting.intervalsAlreadyClaimed();

    let initialBeneficiaryBalance = await erc20.balanceOf(initialBeneficiary);

    await time.setNextBlockTimestamp(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS/2);

    let res = await vesting.changeBeneficiary(newBeneficiary);
    res.wait();

    expect(await vesting.beneficiary()).to.be.equal(newBeneficiary);
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);


    await expect(res).to.emit(vesting, 'ChangedBeneficiary').withArgs(newBeneficiary, initialBeneficiary);
    await _setTimestampAndClaimFails(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS/2 + 1, "NothingToClaim");

    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * 1.5);
    await _assertBalance(newBeneficiary, INITIAL_AMOUNT_EACH_CLAIM);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(initialIntervalsAlreadyClaimed + BigInt(1));

    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryBalance);
  });

  it("changeBeneficiary success after some periods were claimed", async function () {
    let vestingStartTime = await vesting.startTimestamp();   
    let num_of_intervals_to_claim = 2;

    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const initialBeneficiaryExpectedBalance = INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;
    
    await _assertBalance(initialBeneficiary, initialBeneficiaryExpectedBalance);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);

    (await vesting.changeBeneficiary(newBeneficiary)).wait();

    num_of_intervals_to_claim = num_of_intervals_to_claim + 1;
    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryExpectedBalance);
    expect(await erc20.balanceOf(newBeneficiary)).to.be.equal(INITIAL_AMOUNT_EACH_CLAIM);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);
    //Checks that the other parameters were not changed with the beneficiary
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);
  });

  it("changeBeneficiary with some periods accrued by the old beneficiary not claimed yet", async function () {
    let vestingStartTime = await vesting.startTimestamp();   
    let num_of_intervals_to_claim = 2;

    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const initialBeneficiaryExpectedBalance = INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;
    
    await _assertBalance(initialBeneficiary, initialBeneficiaryExpectedBalance);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);

    const additionalIntervalsOfOldBeneficiary = 2;
    num_of_intervals_to_claim = num_of_intervals_to_claim + additionalIntervalsOfOldBeneficiary;    
    await time.setNextBlockTimestamp(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);
    (await vesting.changeBeneficiary(newBeneficiary)).wait();

    const additionalIntervalsOfNewBeneficiary = 1;
    num_of_intervals_to_claim = num_of_intervals_to_claim + additionalIntervalsOfNewBeneficiary; 
    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

    const totalIntervalsNotClaimedYet = additionalIntervalsOfOldBeneficiary + additionalIntervalsOfNewBeneficiary;
    expect(await erc20.balanceOf(initialBeneficiary)).to.be.equal(initialBeneficiaryExpectedBalance);
    expect(await erc20.balanceOf(newBeneficiary)).to.be.equal(INITIAL_AMOUNT_EACH_CLAIM * totalIntervalsNotClaimedYet);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);
    //Checks that the other parameters were not changed with the beneficiary
    expect(await vesting.startTimestamp()).to.be.equal(vestingStartTime);
  });

  it("changeBeneficiary fails after ClaimCompleted", async function () {
    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * INITIAL_INTERVALS_TO_CLAIM + 1);
    await expect(vesting.changeBeneficiary(newBeneficiary)).to.be.revertedWithCustomError(vesting, "UnauthorizedOperation");
  });


  it("changeVestingParams fails if caller is not the owner", async function () {
    let randomUser = (await ethers.getSigners())[3];
    await expect(vesting.connect(randomUser).changeVestingParams(INITIAL_TIME_BETWEEN_INTERVALS + 1, INITIAL_INTERVALS_TO_CLAIM + 1)).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount").withArgs(randomUser);
  });

  it("changeVestingParams fails if new params are 0", async function () {
    await expect(vesting.changeVestingParams(INITIAL_TIME_BETWEEN_INTERVALS + 1, 0)).to.be.revertedWithCustomError(vesting, "InvalidNumOfIntervals");
    await expect(vesting.changeVestingParams(0, INITIAL_INTERVALS_TO_CLAIM + 1)).to.be.revertedWithCustomError(vesting, "InvalidTimes");
  });

  it("changeVestingParams before any claim period has passed", async function () {
    let initialVestingStartTime = await vesting.startTimestamp();

    let newIntervalPeriod = INITIAL_TIME_BETWEEN_INTERVALS + 2;
    let newIntervals = INITIAL_INTERVALS_TO_CLAIM + 3;
    let newClaimAmount = BigInt(VESTING_AMOUNT) / BigInt(newIntervals);

    let newStartTime = initialVestingStartTime + BigInt(INITIAL_TIME_BETWEEN_INTERVALS/2);
    await time.setNextBlockTimestamp(newStartTime);

    let res = await vesting.changeVestingParams(newIntervalPeriod, newIntervals);
    res.wait();

    expect(await vesting.beneficiary()).to.be.equal(initialBeneficiary);
    expect(await vesting.timeBetweenClaims()).to.be.equal(newIntervalPeriod);
    expect(await vesting.intervalsToClaim()).to.be.equal(newIntervals);
    expect(await vesting.amountForEachClaim()).to.be.equal(newClaimAmount);
    await expect(res).to.emit(vesting, 'ChangedVestingParams').withArgs(newIntervalPeriod, newIntervals, INITIAL_TIME_BETWEEN_INTERVALS, INITIAL_INTERVALS_TO_CLAIM);    
    
    expect(await vesting.startTimestamp()).to.be.equal(newStartTime);

    // Check that a claim after the old period has passed fails
    await _setTimestampAndClaimFails(initialVestingStartTime +  BigInt(INITIAL_TIME_BETWEEN_INTERVALS + 1), "NothingToClaim");
    await _setTimestampAndClaimFails(newStartTime +  BigInt(INITIAL_TIME_BETWEEN_INTERVALS + 1), "NothingToClaim");

    // Check that a claim after the new period has passed is OK
    await _setTimestampAndClaim(newStartTime +  BigInt(newIntervalPeriod + 1));
    await _assertBalance(initialBeneficiary, newClaimAmount);

    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(1);

  });


  it("changeVestingParams success after some periods were claimed", async function () {
    // Let's claim the first 2 periods
    let num_of_intervals_to_claim = 2;
    await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);
    const remainingBalance = VESTING_AMOUNT - INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;

    // Change vesting params
    let newIntervalPeriod = INITIAL_TIME_BETWEEN_INTERVALS - 2;
    let newIntervals = INITIAL_INTERVALS_TO_CLAIM + 3;
    let newClaimAmount = BigInt(remainingBalance) / BigInt(newIntervals);
    
    let newStartTime = startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 2;
    await time.setNextBlockTimestamp(newStartTime);
    (await vesting.changeVestingParams(newIntervalPeriod, newIntervals)).wait();

    expect(await vesting.beneficiary()).to.be.equal(initialBeneficiary);
    expect(await vesting.timeBetweenClaims()).to.be.equal(newIntervalPeriod);
    expect(await vesting.intervalsToClaim()).to.be.equal(newIntervals);
    expect(await vesting.amountForEachClaim()).to.be.equal(newClaimAmount);  
    expect(await vesting.startTimestamp()).to.be.equal(newStartTime);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(0);

    await _setTimestampAndClaim(newStartTime + newIntervalPeriod + 1);

    await _assertBalance(initialBeneficiary, BigInt(INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim) + newClaimAmount);
    expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(1);
 });

 it("changeVestingParams with some periods accrued with old params not claimed yet", async function () {
  let num_of_intervals_to_claim = 2;

  await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1);

  const initialBeneficiaryExpectedBalance = INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;
  
  await _assertBalance(initialBeneficiary, initialBeneficiaryExpectedBalance);
  expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(num_of_intervals_to_claim);
  
  const remainingBalance = VESTING_AMOUNT - INITIAL_AMOUNT_EACH_CLAIM * num_of_intervals_to_claim;

  const additionalIntervalsWithOldParams = 2;
  num_of_intervals_to_claim = num_of_intervals_to_claim + additionalIntervalsWithOldParams;    
    
  let newStartTime = startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * num_of_intervals_to_claim + 1;
  await time.setNextBlockTimestamp(newStartTime);

  let newIntervalPeriod = INITIAL_TIME_BETWEEN_INTERVALS - 2;
  let newIntervals = INITIAL_INTERVALS_TO_CLAIM - num_of_intervals_to_claim - 1;

  let newClaimAmount = BigInt(remainingBalance) / BigInt(newIntervals);

  (await vesting.changeVestingParams(newIntervalPeriod, newIntervals)).wait();

  await _setTimestampAndClaim(newStartTime + newIntervalPeriod + 1);

  await _assertBalance(initialBeneficiary, BigInt(INITIAL_AMOUNT_EACH_CLAIM * 2) + newClaimAmount);

  expect(await vesting.intervalsAlreadyClaimed()).to.be.equal(1);

});

it("changeVestingParams fails after ClaimCompleted", async function () {
  let newIntervalPeriod = INITIAL_TIME_BETWEEN_INTERVALS - 2;
  let newIntervals = INITIAL_INTERVALS_TO_CLAIM - 1;
  await _setTimestampAndClaim(startTimestamp + INITIAL_TIME_BETWEEN_INTERVALS * INITIAL_INTERVALS_TO_CLAIM + 1);
  await expect(vesting.changeVestingParams(newIntervalPeriod, newIntervals)).to.be.revertedWithCustomError(vesting, "UnauthorizedOperation");
});


});