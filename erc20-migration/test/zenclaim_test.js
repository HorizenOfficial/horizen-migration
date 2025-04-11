const { expect } = require("chai");
const web3 = require("web3");
var zencashjs = require('zencashjs')
var bs58check = require('bs58check')
const utils = require("./utils");

describe("ZEND Claim test", function () {

  const TOKEN_NAME = "ZTest"; 
  const TOKEN_SYMBOL = "ZTEST";
  const BASE_MESSAGE_PREFIX = "So long and thanks for all the fish";
  const MESSAGE_PREFIX = TOKEN_SYMBOL + BASE_MESSAGE_PREFIX;
  var admin;
  var ZendBackupVault;
  var erc20;  
  var dumpRecursiveHash;

  var TEST1_DESTINATION_ADDRESS  = "0xeDEb4BF692A4a1bfeCad78E09bE5C946EcF6C6da";
  var TEST1_SIGNATURE_HEX;
  var TEST1_PUBLICKEY_X;
  var TEST1_PUBLICKEY_Y;
  var TEST1_ZEND_ADDRESS;
  var TEST1_VALUE = 23000;

  var TEST2_DESTINATION_ADDRESS  = "0x4820e4A0BB7B8979d736CDa6Fd955E6e85e44f28";
  var TEST2_SIGNATURE_HEX;
  var TEST2_PUBLICKEY_X;
  var TEST2_PUBLICKEY_Y;
  var TEST2_ZEND_ADDRESS;
  var TEST2_VALUE = 9000000000;

  var TEST3_DESTINATION_ADDRESS  = "0x767dbb8CB5B05B506c54968FB1A5a2860280A6B2";
  var TEST3_SIGNATURE_HEX;
  var TEST3_PUBLICKEY_X;
  var TEST3_PUBLICKEY_Y;


  var TEST4_VALUE = 234000000000;
  var TEST4_ZEND_ADDRESS;

  var TOTAL_ZEND_BALANCE = TEST1_VALUE + TEST2_VALUE + TEST4_VALUE;

  before(async function () {
    //prepare test data

    //P2PKH uncompressed case
    var privKey1 = zencashjs.address.mkPrivKey('chris p. bacon, defender of the guardians')
    var pubKey1 = zencashjs.address.privKeyToPubKey(privKey1, false) // generate uncompressed pubKey   
    var zAddr1 = zencashjs.address.pubKeyToAddr(pubKey1);
    TEST1_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr1).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = MESSAGE_PREFIX+TEST1_DESTINATION_ADDRESS;
    TEST1_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST1_PUBLICKEY_X = pubKey1.substring(2,66);
    TEST1_PUBLICKEY_Y = pubKey1.substring(66);

    //P2PKH compressed case
    var privKey2 = zencashjs.address.mkPrivKey('another wonderful key')
    var pubKey2 = zencashjs.address.privKeyToPubKey(privKey2, true) // generate compressed pubKey   
    var zAddr2 = zencashjs.address.pubKeyToAddr(pubKey2);
    TEST2_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr2).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = MESSAGE_PREFIX+TEST2_DESTINATION_ADDRESS;
    TEST2_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    var pubKeyUnc = zencashjs.address.privKeyToPubKey(privKey2, false) // x and y requires anyway uncompressed pubKey   
    TEST2_PUBLICKEY_X = pubKeyUnc.substring(2,66);
    TEST2_PUBLICKEY_Y = pubKeyUnc.substring(66);

    //valid signature but nothing to claim
    var privKey3 = zencashjs.address.mkPrivKey('test number 3')
    var pubKey3 = zencashjs.address.privKeyToPubKey(privKey3, false) // generate uncompressed pubKey  
    var messageToSign = MESSAGE_PREFIX+TEST3_DESTINATION_ADDRESS;
    TEST3_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey3, false).toString("hex");
    TEST3_PUBLICKEY_X = pubKey3.substring(2,66);
    TEST3_PUBLICKEY_Y = pubKey3.substring(66);

    var privKey4 = zencashjs.address.mkPrivKey('4-midable')
    var pubKey4 = zencashjs.address.privKeyToPubKey(privKey4, false) // generate uncompressed pubKey  
    var zAddr4 = zencashjs.address.pubKeyToAddr(pubKey4);
    TEST4_ZEND_ADDRESS = "0x" + bs58check.decode(zAddr4).toString("hex").slice(4); //remove the chain prefix
  });

  function updateCumulativeHash(previousHash, address, value){
    //the following hashing algorithm produces the same output as the one used in solidity
    const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'],[previousHash, address, value])
    return web3.utils.sha3(encoded, {encoding: 'hex'})
  }

  it("Calculate locally the dump recursive hash", async function () {
    dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE); 
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST4_ZEND_ADDRESS, TEST4_VALUE); 
  }); 

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory(utils.ZEND_VAULT_CONTRACT_NAME);    
    ZendBackupVault = await factory.deploy(admin, BASE_MESSAGE_PREFIX);
    const receipt = await ZendBackupVault.deploymentTransaction().wait(); // Wait for confirmation
    utils.printReceipt("Deploy of ZendBackupVault contract", receipt);

    expect(await ZendBackupVault.message_prefix()).to.be.equal(""); 
  });

  it("Check store balances fails if cumulative hash checkpoint not set", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE}])).to.be.revertedWithCustomError(ZendBackupVault, "CumulativeHashCheckpointNotSet");
  });

  it("Set cumulative hash checkpoint in the backup contract", async function () {
    await ZendBackupVault.setCumulativeHashCheckpoint(dumpRecursiveHash);    
  });

  it("Check store balances fails if ERC20 not set", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE}])).to.be.revertedWithCustomError(ZendBackupVault, "ERC20NotSet");
  });

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);
    const MOCK_EON_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    erc20 = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, MOCK_EON_VAULT_ADDRESS, await ZendBackupVault.getAddress());
  });

  it("Set ERC-20 contract reference in the backup contract", async function () {
    await ZendBackupVault.setERC20(await erc20.getAddress());    
  });

  it("Cannot set again ERC-20 contract reference in the backup contract", async function () {
    await expect(ZendBackupVault.setERC20(await erc20.getAddress())).to.be.revertedWithCustomError(ZendBackupVault, "UnauthorizedOperation");    
  });

  it("Check message prefix", async function () {
     expect(await ZendBackupVault.message_prefix()).to.be.equal(MESSAGE_PREFIX);   
  });

  it("First batchInsert in the contract", async function () {
    var addressesValues = [];
    var calcCumulativeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";

    addressesValues.push({addr: TEST1_ZEND_ADDRESS, value: TEST1_VALUE});
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    addressesValues.push({addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE});
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);

    await ZendBackupVault.batchInsert(calcCumulativeHash, addressesValues); 
    expect(await ZendBackupVault._cumulativeHash()).to.equal(calcCumulativeHash);

  });

  it("Check that first batch ZENs were minted", async function () {
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(TEST1_VALUE + TEST2_VALUE);
  });  

  it("Second batchInsert in the contract", async function () {
    var addressesValues = [];
    var calcCumulativeHash = await ZendBackupVault._cumulativeHash();

    addressesValues.push({addr: TEST4_ZEND_ADDRESS, value: TEST4_VALUE});
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST4_ZEND_ADDRESS, TEST4_VALUE);

    await ZendBackupVault.batchInsert(calcCumulativeHash, addressesValues); 

  });

  it("Check that first batch ZENs were minted", async function () {
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(TOTAL_ZEND_BALANCE);
  });  

  it("Check store balances fails if cumulative hash checkpoint reached", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE}])).to.be.revertedWithCustomError(ZendBackupVault, "CumulativeHashCheckpointReached");
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZendBackupVault._cumulativeHash();
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });  

  it("Claim of a P2PKH uncompressed", async function () {
    let zendVaultBalance = await erc20.balanceOf(await ZendBackupVault.getAddress());
    await ZendBackupVault.claimP2PKH(TEST1_DESTINATION_ADDRESS, "0x"+TEST1_SIGNATURE_HEX, "0x"+TEST1_PUBLICKEY_X, "0x"+TEST1_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST1_DESTINATION_ADDRESS)).to.equal(TEST1_VALUE);
    expect(await erc20.totalSupply(), "the total supply shouldn't change").to.equal(TOTAL_ZEND_BALANCE);
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(zendVaultBalance - BigInt(TEST1_VALUE));
  });

  it("Claim of a P2PKH compressed", async function () {
    let zendVaultBalance = await erc20.balanceOf(await ZendBackupVault.getAddress());
    await ZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST2_DESTINATION_ADDRESS)).to.equal(TEST2_VALUE);
    expect(await erc20.totalSupply(), "the total supply shouldn't change").to.equal(TOTAL_ZEND_BALANCE);
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(zendVaultBalance - BigInt(TEST2_VALUE));
  });

  it("Correct signature but nothing to claim", async function () {
    await expect(ZendBackupVault.claimP2PKH(TEST3_DESTINATION_ADDRESS, "0x"+TEST3_SIGNATURE_HEX, "0x"+TEST3_PUBLICKEY_X, "0x"+TEST3_PUBLICKEY_Y))
       .to.be.revertedWithCustomError(ZendBackupVault, "NothingToClaim")
  });

  it("Check double-claim protection", async function () {
    await expect(ZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_Y))
         .to.be.revertedWithCustomError(ZendBackupVault, "NothingToClaim")
  });

});