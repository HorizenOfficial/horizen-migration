const { expect } = require("chai");
const web3 = require("web3");
const JSONbig = require("json-bigint")({ storeAsString: true });
const fs = require("fs");
const path = require("path");
const utils = require("./utils");

describe("ZEN Token contract testing", function () {

  var minter_1;
  var minter_2;
  var horizenFoundation;
  var horizenFoundationVested;
  var horizenDao;
  var horizenDaoVested;
  var zenToken;


  const MAX_ZEN_SUPPLY = BigInt(21_000_000n) * BigInt(10 ** 18);

  before(async function () {
    expect((await ethers.getSigners()).length, "Not enough signers for the test! Check that .env is correct").to.be.at.least(5);
    minter_1 = (await ethers.getSigners())[0];
    minter_2 = (await ethers.getSigners())[1];
    horizenFoundation = (await ethers.getSigners())[2];
    horizenFoundationVested = (await ethers.getSigners())[3]; //for the purpose of this test, we will just use a EOA instead of the vesting contract
    horizenDao = (await ethers.getSigners())[4];
    horizenDaoVested = (await ethers.getSigners())[5];  //for the purpose of this test, we will just use a EOA instead of the vesting contract
  });


  it("Deployment of the ERC-20 contract", async function () {
    let factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);
    zenToken = await factory.deploy("ZTest", "ZTEST", minter_1, minter_2, horizenFoundation, horizenFoundationVested, horizenDao, horizenDaoVested);
    let receipt = await zenToken.deploymentTransaction().wait(); // Wait for confirmation

    expect(await zenToken.cap(), "Wrong max supply").to.equal(MAX_ZEN_SUPPLY);
    expect(await zenToken.totalSupply()).to.equal(0);

    let res =  await zenToken.mint(minter_1, 1);
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);
    expect(await zenToken.totalSupply()).to.equal(1);

    res =  await zenToken.connect(minter_2).mint(minter_1, 1);
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);
    expect(await zenToken.totalSupply()).to.equal(2);


    await expect(zenToken.connect(horizenFoundation).mint(minter_1, 1), "account without minter role could mint").to.be.revertedWithCustomError(zenToken, "CallerNotMinter"); 
   
    // Try to mint over the max supply
    await expect(zenToken.mint(minter_1, MAX_ZEN_SUPPLY - BigInt(1)), "Could mint over maximum supply").to.be.revertedWithCustomError(zenToken, "ERC20ExceededCap"); 

  });

  it("Notify end of minting", async function () {
    let initialSupply = await zenToken.totalSupply();

    // check that non minter accounts cannot call notifyMintingDone
    await expect(zenToken.connect(horizenFoundation).notifyMintingDone(), "account without minter role could call notifyMintingDone").to.be.revertedWithCustomError(zenToken, "CallerNotMinter"); 

    // minter_1 calls notifyMintingDone
    let res = await zenToken.notifyMintingDone();
    let receipt = await res.wait();
   
    await expect(zenToken.mint(horizenFoundation, 1), "minter_1 could mint after calling notifyMintingDone").to.be.revertedWithCustomError(zenToken, "CallerNotMinter"); 
    //Verify that minter_2 could still mint
    res =  await zenToken.connect(minter_2).mint(minter_1, 1);
    receipt = await res.wait();
    expect(receipt.status).to.equal(1);
    initialSupply = initialSupply +  BigInt(1);
    expect(await zenToken.totalSupply()).to.equal(initialSupply);

    
    await expect(zenToken.notifyMintingDone(), "minter_1 could call again notifyMintingDone").to.be.revertedWithCustomError(zenToken, "CallerNotMinter"); 

    // minter_2 calls notifyMintingDone
    // Verify horizenFoundation balance before calling notifyMintingDone

    expect(await zenToken.balanceOf(horizenFoundation)).to.equal(0);

    res = await zenToken.connect(minter_2).notifyMintingDone();
    receipt = await res.wait();

    await expect(zenToken.connect(minter_2).mint(horizenFoundation, 1)).to.be.revertedWithCustomError(zenToken, "CallerNotMinter"); 

    // Check that after both minters notified the end of minting, the remaining supply was assigned to horizenFoundation
    expect(await zenToken.totalSupply()).to.equal(MAX_ZEN_SUPPLY);
    expect(await zenToken.balanceOf(horizenFoundation)).to.equal(MAX_ZEN_SUPPLY - BigInt(initialSupply));

    
  });







});