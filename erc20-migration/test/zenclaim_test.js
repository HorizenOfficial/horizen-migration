const { expect } = require("chai");
const web3 = require("web3");
var zencashjs = require('zencashjs')
var bs58check = require('bs58check')

describe("ZEND Claim test", function () {

  var admin;
  var ZTESTZendBackupVault;
  var erc20;  
  var dumpRecursiveHash;

  var TEST1_DESTINATION_ADDRESS  = ("0xeDEb4BF692A4a1bfeCad78E09bE5C946EcF6C6da").toLowerCase();
  var TEST1_SIGNATURE_HEX;
  var TEST1_PUBLICKEY_X;
  var TEST1_PUBLICKEY_Y;
  var TEST1_ZEND_ADDRESS;
  var TEST1_VALUE = 23000;

  var TEST2_DESTINATION_ADDRESS  = ("0x4820e4A0BB7B8979d736CDa6Fd955E6e85e44f28").toLowerCase();
  var TEST2_SIGNATURE_HEX;
  var TEST2_PUBLICKEY_X;
  var TEST2_PUBLICKEY_Y;
  var TEST2_ZEND_ADDRESS;
  var TEST2_VALUE = 9000000000;

  before(async function () {
  });

  function updateCumulativeHash(previousHash, address, value){
    //the following hashing algorithm produces the same output as the one used in solidity
    const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'],[previousHash, address, value])
    return web3.utils.sha3(encoded, {encoding: 'hex'})
  }



  it("Create some test data", async function () {

    //uncompressed case
    var privKey1 = zencashjs.address.mkPrivKey('chris p. bacon, defender of the guardians')
    var pubKey1 = zencashjs.address.privKeyToPubKey(privKey1, false) // generate uncompressed pubKey   
    var zAddr1 = zencashjs.address.pubKeyToAddr(pubKey1);
    TEST1_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr1).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = "ZENCLAIM"+TEST1_DESTINATION_ADDRESS;
    TEST1_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST1_PUBLICKEY_X = pubKey1.substring(2,66);
    TEST1_PUBLICKEY_Y = pubKey1.substring(66);

    //compressed case
    var privKey2 = zencashjs.address.mkPrivKey('chris p. bacon, defender of the guardians')
    var pubKey2 = zencashjs.address.privKeyToPubKey(privKey2, true) // generate compressed pubKey   
    var zAddr2 = zencashjs.address.pubKeyToAddr(pubKey2);
    TEST2_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr2).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = "ZENCLAIM"+TEST2_DESTINATION_ADDRESS;
    TEST2_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    var pubKeyUnc = zencashjs.address.privKeyToPubKey(privKey2, false) // x and y requires anyway uncompressed pubKey   
    TEST2_PUBLICKEY_X = pubKeyUnc.substring(2,66);
    TEST2_PUBLICKEY_Y = pubKeyUnc.substring(66);
  });

  it("Calculate locally the dump recursive hash", async function () {
    dumpRecursiveHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE); 
    console.log("Hash computed locally:", dumpRecursiveHash);
  }); 

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory("ZTESTZendBackupVault");    
    ZTESTZendBackupVault = await factory.deploy(admin, dumpRecursiveHash);
  });

  it("Store backup balances in the contract (in batches of 5)", async function () {
    var addresses = [];
    var balances = [];
    var calcCumulativeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";

    addresses.push(TEST1_ZEND_ADDRESS);
    balances.push(TEST1_VALUE);
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    addresses.push(TEST2_ZEND_ADDRESS);
    balances.push(TEST2_VALUE);
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);

    console.log("Inserting batch");
    await ZTESTZendBackupVault.batchInsert(calcCumulativeHash, addresses, balances);
 
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZTESTZendBackupVault.getCumulativeHash();
    console.log("Hash from the contract: "+cumulativeHashFromContract);
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });  

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory("ZTEST");
    erc20 = await factory.deploy(await ZTESTZendBackupVault.getAddress());
  });

  it("Set ERC-20 contract reference in the backup contract", async function () {
    await ZTESTZendBackupVault.setERC20(await erc20.getAddress());    
  });

  it("Claim of a P2PKH uncompressed", async function () {
    await ZTESTZendBackupVault.claimP2PKH(TEST1_DESTINATION_ADDRESS, "0x"+TEST1_SIGNATURE_HEX, "0x"+TEST1_PUBLICKEY_X, "0x"+TEST1_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST1_DESTINATION_ADDRESS)).to.equal(TEST1_VALUE);
  });

  it("Claim of a P2PKH compressed", async function () {
    await ZTESTZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST2_DESTINATION_ADDRESS)).to.equal(TEST2_VALUE);
  });



    /*
    {
      var pubKey = zencashjs.address.privKeyToPubKey(priv, false) // generate uncompressed pubKey    
      var zAddr = zencashjs.address.pubKeyToAddr(pubKey)
      var zAddrDecoded = bs58check.decode(zAddr).toString("hex").slice(4); //remove the chain prefix
      console.log("Pubkey: "+pubKey);
      console.log("zAddr: "+zAddr);
      console.log("zAddrDecoded: "+zAddrDecoded);
  
      var messageToSign = "ZENCLAIM"+destinationAddress;
      var signature = zencashjs.message.sign(messageToSign, priv, false);
      console.log("signature: "+signature.toString("hex"));
  
      var pubKeyX = pubKey.substring(2,66);
      var pubKeyY = pubKey.substring(66);
      await ClaimableZenERC20.claim(destinationAddress, "0x"+signature.toString("hex"), "0x"+pubKeyX, "0x"+pubKeyY);
    }


    console.log("-----");


    //compressed case
    {
      var pubKey = zencashjs.address.privKeyToPubKey(priv, true) // generate compressed pubKey    
      var zAddr = zencashjs.address.pubKeyToAddr(pubKey)
      var zAddrDecoded = bs58check.decode(zAddr).toString("hex").slice(4); //remove the chain prefix
      console.log("Pubkey: "+pubKey);
      console.log("zAddr: "+zAddr);
      console.log("zAddrDecoded: "+zAddrDecoded);
  
      var messageToSign = "ZENCLAIM"+destinationAddress;
      var signature = zencashjs.message.sign(messageToSign, priv, true);
      console.log("signature: "+signature.toString("hex"));
  
      var pubKeyUnc = zencashjs.address.privKeyToPubKey(priv, false) // generate compressed pubKey   
      var pubKeyX = pubKeyUnc.substring(2,66);
      var pubKeyY = pubKeyUnc.substring(66);
      await ClaimableZenERC20.claim(destinationAddress, "0x"+signature.toString("hex"), "0x"+pubKeyX, "0x"+pubKeyY);
    }
    /*
    pubKey = zencashjs.address.privKeyToPubKey(priv, true) // generate un compressed pubKey    
    zAddr = zencashjs.address.pubKeyToAddr(pubKey)
    zAddrDecoded = bs58check.decode(zAddr).toString("hex").slice(4); //remove the chain prefix
    console.log("Pubkey: "+pubKey);
    console.log("zAddr: "+zAddr);
    console.log("zAddrDecoded: "+zAddrDecoded);
    console.log("TEST: "+await ClaimableZenERC20.test2())
    */



    /*
    var pubKeyCompressed = zencashjs.address.privKeyToPubKey(priv, true) // generate compressed pubKey
    var zAddrCompressed = zencashjs.address.pubKeyToAddr(pubKeyCompressed)

    console.log("Privkey: "+priv);
    console.log("Pubkey compressed: "+pubKeyCompressed);
    console.log("zAddr compressed: "+zAddrCompressed);
    var zAddrCompressedDecoded = bs58check.decode(zAddrCompressed).toString("hex");
    console.log("zAddr compressed decoded: "+zAddrCompressedDecoded);
    console.log(" again endocded: "+bs58check.encode(Buffer.from("0x"+zAddrCompressedDecoded)));
    console.log("Pubkey uncompressed: "+pubKeyUncompressed);
    console.log("zAddr uncompressed: "+zAddrUnCompressed);
    var zAddrunCompressedDecoded = bs58check.decode(zAddrUnCompressed).toString("hex");
    console.log("zAddr uncompressed decoded: "+zAddrunCompressedDecoded);
    var destinationAddress = ("0x4820e4A0BB7B8979d736CDa6Fd955E6e85e44f28").toLowerCase();
    console.log("destination address: "+destinationAddress);

    */

    



});