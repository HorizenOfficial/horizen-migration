const { expect } = require("chai");
const web3 = require("web3");
var zencashjs = require('zencashjs')
var bs58check = require('bs58check')

describe("ZEND Claim test", function () {
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

  var admin;
  var ZTESTZendBackupVault;
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

  var TEST_MULTISIG_DESTINATION_ADDRESS = "0xA89c7db6F4f3912674372Aaf7088b56d631301e6";
  var TEST_MULTISIG_SCRIPT;
  var TEST_MULTISIG_ADDRESS;
  var TEST_MULTISIG_SIGNATURE_HEX_1;
  var TEST_MULTISIG_SIGNATURE_HEX_2;
  var TEST_MULTISIG_SIGNATURE_HEX_3;
  var TEST_MULTISIG_VALUE = 51095;

  before(async function () {
    //prepare test data

    //P2PKH uncompressed case
    var privKey1 = zencashjs.address.mkPrivKey('chris p. bacon, defender of the guardians')
    var pubKey1 = zencashjs.address.privKeyToPubKey(privKey1, false) // generate uncompressed pubKey   
    var zAddr1 = zencashjs.address.pubKeyToAddr(pubKey1);
    TEST1_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr1).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = "ZENCLAIM"+TEST1_DESTINATION_ADDRESS;
    TEST1_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST1_PUBLICKEY_X = pubKey1.substring(2,66);
    TEST1_PUBLICKEY_Y = pubKey1.substring(66);

    //P2PKH compressed case
    var privKey2 = zencashjs.address.mkPrivKey('another wonderful key')
    var pubKey2 = zencashjs.address.privKeyToPubKey(privKey2, true) // generate compressed pubKey   
    var zAddr2 = zencashjs.address.pubKeyToAddr(pubKey2);
    TEST2_ZEND_ADDRESS = "0x"+bs58check.decode(zAddr2).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = "ZENCLAIM"+TEST2_DESTINATION_ADDRESS;
    TEST2_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    var pubKeyUnc = zencashjs.address.privKeyToPubKey(privKey2, false) // x and y requires anyway uncompressed pubKey   
    TEST2_PUBLICKEY_X = pubKeyUnc.substring(2,66);
    TEST2_PUBLICKEY_Y = pubKeyUnc.substring(66);

    //valid signature but nothing to claim
    var privKey3 = zencashjs.address.mkPrivKey('test number 3')
    var pubKey3 = zencashjs.address.privKeyToPubKey(privKey3, false) // generate uncompressed pubKey  
    var messageToSign = "ZENCLAIM"+TEST3_DESTINATION_ADDRESS;
    TEST3_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey3, false).toString("hex");
    TEST3_PUBLICKEY_X = pubKey3.substring(2,66);
    TEST3_PUBLICKEY_Y = pubKey3.substring(66);

    //multisig case - use the already created 3 wallets
    TEST_MULTISIG_SCRIPT = zencashjs.address.mkMultiSigRedeemScript([pubKey1, pubKey2, pubKey3], 2, 3);
    var zenMultisigAddress = zencashjs.address.multiSigRSToAddress(TEST_MULTISIG_SCRIPT); 
    TEST_MULTISIG_ADDRESS = "0x"+bs58check.decode(zenMultisigAddress).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = "ZENCLAIM"+TEST_MULTISIG_ADDRESS+TEST_MULTISIG_DESTINATION_ADDRESS;
    TEST_MULTISIG_SIGNATURE_HEX_1 = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST_MULTISIG_SIGNATURE_HEX_2 = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    TEST_MULTISIG_SIGNATURE_HEX_3 = zencashjs.message.sign(messageToSign, privKey3, false).toString("hex");
  });

  function updateCumulativeHash(previousHash, address, value){
    //the following hashing algorithm produces the same output as the one used in solidity
    const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'],[previousHash, address, value])
    return web3.utils.sha3(encoded, {encoding: 'hex'})
  }

  it("Calculate locally the dump recursive hash", async function () {
    dumpRecursiveHash = ZERO_BYTES32;
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE); 
  }); 

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory("ZTESTZendBackupVault");    
    ZTESTZendBackupVault = await factory.deploy(admin);
  });

  it("Set cumulative hash checkpoint in the backup contract", async function () {
    await ZTESTZendBackupVault.setCumulativeHashCheckpoint(dumpRecursiveHash);    
  });

  it("Store backup balances in the contract", async function () {
    var addressesValues = [];
    var calcCumulativeHash = ZERO_BYTES32

    addressesValues.push({addr: TEST1_ZEND_ADDRESS, value: TEST1_VALUE});
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    addressesValues.push({addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE});
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);

    await ZTESTZendBackupVault.batchInsert(calcCumulativeHash, addressesValues); 
  });

  it("Check store balances fails if cumulative hash checkpoint reached", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZTESTZendBackupVault.batchInsert(calcCumulativeHash, [{addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE}])).to.be.revertedWithCustomError(ZTESTZendBackupVault, "CumulativeHashCheckpointReached");
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZTESTZendBackupVault._cumulativeHash();
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });  

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory("ZTEST");
    const MOCK_EON_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    erc20 = await factory.deploy(MOCK_EON_VAULT_ADDRESS, await ZTESTZendBackupVault.getAddress());
  });

  it("Set ERC-20 contract reference in the backup contract", async function () {
    await ZTESTZendBackupVault.setERC20(await erc20.getAddress());    
  });

  it("Cannot set again ERC-20 contract reference in the backup contract", async function () {
    await expect(ZTESTZendBackupVault.setERC20(await erc20.getAddress())).to.be.revertedWithCustomError(ZTESTZendBackupVault, "UnauthorizedOperation");    
  });

  it("Claim of a P2PKH uncompressed", async function () {
    await ZTESTZendBackupVault.claimP2PKH(TEST1_DESTINATION_ADDRESS, "0x"+TEST1_SIGNATURE_HEX, "0x"+TEST1_PUBLICKEY_X, "0x"+TEST1_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST1_DESTINATION_ADDRESS)).to.equal(TEST1_VALUE);
  });

  it("Claim of a P2PKH compressed", async function () {
    await ZTESTZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_Y);
    expect(await erc20.balanceOf(TEST2_DESTINATION_ADDRESS)).to.equal(TEST2_VALUE);
  });

  it("Correct signature but nothing to claim", async function () {
    await expect(ZTESTZendBackupVault.claimP2PKH(TEST3_DESTINATION_ADDRESS, "0x"+TEST3_SIGNATURE_HEX, "0x"+TEST3_PUBLICKEY_X, "0x"+TEST3_PUBLICKEY_Y))
       .to.be.revertedWithCustomError(ZTESTZendBackupVault, "NothingToClaim")
  });

  it("Check double-claim protection", async function () {
    await expect(ZTESTZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_Y))
         .to.be.revertedWithCustomError(ZTESTZendBackupVault, "NothingToClaim")
  });

  //MULTISIG TESTS
  async function _deployContractForMultisigTests(shouldInsertMultisigBalance) {
    if(!admin) admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory("ZTESTZendBackupVault");    
    var ZTESTZendBackupVaultMultisig = await factory.deploy(admin);

    var factory = await ethers.getContractFactory("ZTEST");
    const MOCK_EON_VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    var erc20 = await factory.deploy(MOCK_EON_VAULT_ADDRESS, await ZTESTZendBackupVaultMultisig.getAddress());

    await ZTESTZendBackupVaultMultisig.setERC20(await erc20.getAddress());    
  
    if(shouldInsertMultisigBalance) {
      //load data for multisig test


      var dumpRecursiveHash = ZERO_BYTES32
      dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST_MULTISIG_ADDRESS, TEST_MULTISIG_VALUE);
      await ZTESTZendBackupVaultMultisig.setCumulativeHashCheckpoint(dumpRecursiveHash); 
  
      let addressesValues = [{addr: TEST_MULTISIG_ADDRESS, value: TEST_MULTISIG_VALUE}];
      await ZTESTZendBackupVaultMultisig.batchInsert(dumpRecursiveHash, addressesValues); 
    }
    return ZTESTZendBackupVaultMultisig;
  }

  async function _checkMultisigBalance(ZTESTZendBackupVaultMultisig) {
    let erc20Address = await ZTESTZendBackupVaultMultisig.zenToken();
    let factory = await ethers.getContractFactory("ZTEST");
    let token = await factory.attach(erc20Address);
    let balance = await token.balanceOf(TEST_MULTISIG_DESTINATION_ADDRESS);
    expect(balance).to.equal(TEST_MULTISIG_VALUE);
  }

  it("Multisig test - claim with signature 1 and 2", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_2, "0x"];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_X, ZERO_BYTES32];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, "0x"+TEST2_PUBLICKEY_Y, ZERO_BYTES32];
    
    await ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY);
    await _checkMultisigBalance(ZTESTZendBackupVaultMultisig);
  });

  it("Multisig test - claim with signature 1 and 3", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_X];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_Y];

    await ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY);
    await _checkMultisigBalance(ZTESTZendBackupVaultMultisig);
  });

  it("Multisig test - claim with signature 2 and 3", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_2, "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeysX = [ZERO_BYTES32, "0x"+TEST2_PUBLICKEY_X, "0x"+TEST3_PUBLICKEY_X];
    let pubKeysY = [ZERO_BYTES32, "0x"+TEST2_PUBLICKEY_Y, "0x"+TEST3_PUBLICKEY_Y];
    
    await ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY);
    await _checkMultisigBalance(ZTESTZendBackupVaultMultisig);
  });

  it("Multisig test - claim fails with not enough signatures", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, ZERO_BYTES32, ZERO_BYTES32];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, ZERO_BYTES32, ZERO_BYTES32];

    await expect(ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "InsufficientSignatures")
  });

  it("Multisig test - claim fails with duplicated signatures", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_X, ZERO_BYTES32];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, "0x"+TEST2_PUBLICKEY_Y, ZERO_BYTES32];

    await expect(ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "InsufficientSignatures")
  });

  it("Multisig test - claim fails with duplicated pub keys", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, "0x"+TEST1_PUBLICKEY_X, ZERO_BYTES32];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, "0x"+TEST1_PUBLICKEY_Y, ZERO_BYTES32];

    await expect(ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "InvalidPublicKey")
  });

  it("Multisig test - claim fails with invalid signature array", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_2]; //only two items
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, "0x"+TEST2_PUBLICKEY_X, ZERO_BYTES32];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, "0x"+TEST2_PUBLICKEY_Y, ZERO_BYTES32];

    await expect(ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "InvalidSignatureArrayLength")
  });

  it("Multisig test - double claim fails the second time", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_X];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_Y];

    //legit claim
    await ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY);
    //double claim
    await expect(ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "NothingToClaim")
  });

  it("Multisig test - claim fails if nothing to claim", async function () {
    let  ZTESTZendBackupVaultMultisig = await _deployContractForMultisigTests(false); //with false doesn't load the data
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeysX = ["0x"+TEST1_PUBLICKEY_X, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_X];
    let pubKeysY = ["0x"+TEST1_PUBLICKEY_Y, ZERO_BYTES32, "0x"+TEST3_PUBLICKEY_Y];

    await expect( ZTESTZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeysX, pubKeysY))
      .to.be.revertedWithCustomError(ZTESTZendBackupVaultMultisig, "CumulativeHashCheckpointNotSet")
  });
});