const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");
const utils = require("./utils");

describe("ZEN Token contract testing", function () {

  var minter_1;
  var minter_2;
  var erc20;

  const MAX_ZEN_SUPPLY = BigInt(21_000_000n) * BigInt(10 ** 18);

  before(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(3);
    minter_1 = (await ethers.getSigners())[0];
    minter_2 = (await ethers.getSigners())[1];
    
  });


  it("Deployment of the ERC-20 contract", async function () {
    let factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);
    erc20 = await factory.deploy("ZTest", "ZTEST", minter_1, minter_2);
    let receipt = await erc20.deploymentTransaction().wait(); // Wait for confirmation
    utils.printReceipt("Deploy of ERC-20 contract", receipt);

    expect(await erc20.cap(), "Wrong max supply").to.equal(MAX_ZEN_SUPPLY);
    expect(await erc20.totalSupply()).to.equal(0);

    let res =  await erc20.mint(minter_1, 1);
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);

    res =  await erc20.connect(minter_2).mint(minter_1, 1);
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);

    let non_minter = (await ethers.getSigners())[2];
    await expect(erc20.connect(non_minter).mint(minter_1, 1), "Account without minter role could mint").to.be.revertedWithCustomError(erc20, "CallerNotMinter"); 

    //  Check max supply
    res =  await erc20.mint(non_minter, MAX_ZEN_SUPPLY - BigInt(2));
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);

    expect(await erc20.totalSupply()).to.equal(MAX_ZEN_SUPPLY);

    // Try to mint over the max supply
    await expect(erc20.mint(minter_1, 1), "Could mint over maximum supply").to.be.revertedWithCustomError(erc20, "ERC20ExceededCap"); 

  });





});