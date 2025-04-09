const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vesting test", function () {

  let erc20;
  let vesting;
  let beneficiary;
  let TIME_BETWEEN_INTERVALS = 1000;
  let INTERVALS_TO_CLAIM = 20;
  let AMOUNT_EACH_CLAIM = 10;
  let START_TIMESTAMP = 100;

  beforeEach(async function () {
    beneficiary = (await ethers.getSigners())[0].address;

    //deploy erc20
    let factory = await ethers.getContractFactory("ZTEST");
    const MOCK_EON_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    erc20 = await factory.deploy(MOCK_EON_VAULT_ADDRESS, beneficiary);
    await erc20.deploymentTransaction().wait();

    //deploy vesting
    factory = await ethers.getContractFactory("LinearTokenVesting");
    vesting = await factory.deploy(await erc20.getAddress(), beneficiary, AMOUNT_EACH_CLAIM, START_TIMESTAMP, TIME_BETWEEN_INTERVALS, INTERVALS_TO_CLAIM);
    await vesting.deploymentTransaction().wait();

    //mint
    await erc20.mint(await vesting.getAddress(), AMOUNT_EACH_CLAIM*INTERVALS_TO_CLAIM);
  });

  it("TODO", async function () {
    expect(true).to.be.equal(true);
  });
});