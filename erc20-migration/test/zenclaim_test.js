const { expect } = require("chai");
const web3 = require("web3");
var zencashjs = require('zencashjs')
var bs58check = require('bs58check')
const createHash = require('create-hash')
const utils = require("./utils");

describe("ZEND Claim test", function () {
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const ZERO_PUBLICKEY = [ZERO_BYTES32, ZERO_BYTES32];

  const TOKEN_NAME = "ZTest";
  const TOKEN_SYMBOL = "ZTEST";
  const BASE_MESSAGE_PREFIX = "So long and thanks for all the fish";
  const MESSAGE_PREFIX = TOKEN_SYMBOL + BASE_MESSAGE_PREFIX;

  var admin;
  var ZendBackupVault;
  var erc20;
  var dumpRecursiveHash;

  var TEST1_DESTINATION_ADDRESS = "0xeDEb4BF692A4a1bfeCad78E09bE5C946EcF6C6da";
  var TEST1_SIGNATURE_HEX;
  var TEST1_PUBLICKEY;
  var TEST1_ZEND_ADDRESS;
  var TEST1_VALUE = 23000;

  var TEST2_DESTINATION_ADDRESS = "0x4820e4A0BB7B8979d736CDa6Fd955E6e85e44f28";
  var TEST2_SIGNATURE_HEX;
  var TEST2_PUBLICKEY;
  var TEST2_ZEND_ADDRESS;
  var TEST2_VALUE = 9000000000;

  var TEST3_DESTINATION_ADDRESS = "0x767dbb8CB5B05B506c54968FB1A5a2860280A6B2";
  var TEST3_SIGNATURE_HEX;
  var TEST3_PUBLICKEY;

  var TEST_MULTISIG_DESTINATION_ADDRESS = "0xA89c7db6F4f3912674372Aaf7088b56d631301e6";
  var TEST_MULTISIG_SCRIPT;
  var TEST_MULTISIG_ADDRESS;
  var TEST_MULTISIG_SIGNATURE_HEX_1;
  var TEST_MULTISIG_SIGNATURE_HEX_2;
  var TEST_MULTISIG_SIGNATURE_HEX_3;
  var TEST_MULTISIG_VALUE = 51095;


  var TEST4_VALUE = 234000000000;
  var TEST4_ZEND_ADDRESS;

  var TOTAL_ZEND_BALANCE = TEST1_VALUE + TEST2_VALUE + TEST4_VALUE;

  var TEST_DIRECT_BASE_ADDRESS;
  var TEST_DIRECT_ZEND_ADDRESS;
  var TEST_DIRECT_VALUE = 95105;

  const MOCK_EMPTY_ADDRESS = "0x0000000000000000000000000000000000000001";

  before(async function () {
    //prepare test data

    //P2PKH uncompressed case
    var privKey1 = zencashjs.address.mkPrivKey('chris p. bacon, defender of the guardians')
    var pubKey1 = zencashjs.address.privKeyToPubKey(privKey1, false) // generate uncompressed pubKey   
    var zAddr1 = zencashjs.address.pubKeyToAddr(pubKey1);
    TEST1_ZEND_ADDRESS = "0x" + bs58check.decode(zAddr1).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = MESSAGE_PREFIX + TEST1_DESTINATION_ADDRESS;
    TEST1_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST1_PUBLICKEY = ["0x"+pubKey1.substring(2,66), "0x"+pubKey1.substring(66)];

    //P2PKH compressed case
    var privKey2 = zencashjs.address.mkPrivKey('another wonderful key')
    var pubKey2 = zencashjs.address.privKeyToPubKey(privKey2, true) // generate compressed pubKey   
    var zAddr2 = zencashjs.address.pubKeyToAddr(pubKey2);
    TEST2_ZEND_ADDRESS = "0x" + bs58check.decode(zAddr2).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = MESSAGE_PREFIX + TEST2_DESTINATION_ADDRESS;
    TEST2_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    var pubKeyUnc = zencashjs.address.privKeyToPubKey(privKey2, false) // x and y requires anyway uncompressed pubKey   
    TEST2_PUBLICKEY = ["0x"+pubKeyUnc.substring(2,66), "0x"+pubKeyUnc.substring(66)];

    //valid signature but nothing to claim
    var privKey3 = zencashjs.address.mkPrivKey('test number 3')
    var pubKey3 = zencashjs.address.privKeyToPubKey(privKey3, false) // generate uncompressed pubKey  
    var messageToSign = MESSAGE_PREFIX + TEST3_DESTINATION_ADDRESS;
    TEST3_SIGNATURE_HEX = zencashjs.message.sign(messageToSign, privKey3, false).toString("hex");

    TEST3_PUBLICKEY = ["0x"+pubKey3.substring(2,66), "0x"+pubKey3.substring(66)];

    //multisig case - use the already created 3 wallets
    TEST_MULTISIG_SCRIPT = zencashjs.address.mkMultiSigRedeemScript([pubKey1, pubKey2, pubKey3], 2, 3);
    var zenMultisigAddress = zencashjs.address.multiSigRSToAddress(TEST_MULTISIG_SCRIPT); 
    TEST_MULTISIG_ADDRESS = "0x"+bs58check.decode(zenMultisigAddress).toString("hex").slice(4); //remove the chain prefix
    var messageToSign = MESSAGE_PREFIX+TEST_MULTISIG_ADDRESS+TEST_MULTISIG_DESTINATION_ADDRESS;
    TEST_MULTISIG_SIGNATURE_HEX_1 = zencashjs.message.sign(messageToSign, privKey1, false).toString("hex");
    TEST_MULTISIG_SIGNATURE_HEX_2 = zencashjs.message.sign(messageToSign, privKey2, true).toString("hex");
    TEST_MULTISIG_SIGNATURE_HEX_3 = zencashjs.message.sign(messageToSign, privKey3, false).toString("hex");

    var privKey4 = zencashjs.address.mkPrivKey('4-midable')
    var pubKey4 = zencashjs.address.privKeyToPubKey(privKey4, false) // generate uncompressed pubKey  
    var zAddr4 = zencashjs.address.pubKeyToAddr(pubKey4);
    TEST4_ZEND_ADDRESS = "0x" + bs58check.decode(zAddr4).toString("hex").slice(4); //remove the chain prefix

    TEST_DIRECT_BASE_ADDRESS = "0x6ebacd4a2a48728e98aAAA101C59f2e0c57fA987";
    var prefix = '2089'
    //calculate correspondant zend address
    var directZENDTransferAddress = bs58check.encode(
      Buffer.from(
        prefix +
        createHash('rmd160').update(
          createHash('sha256').update(
            Buffer.from(TEST_DIRECT_BASE_ADDRESS.substring(2), 'hex')
          ).digest()
        ).digest('hex'),
      'hex')
    )
    TEST_DIRECT_ZEND_ADDRESS = "0x" + bs58check.decode(directZENDTransferAddress).toString("hex").slice(4); //remove the chain prefix
  });

  function updateCumulativeHash(previousHash, address, value) {
    //the following hashing algorithm produces the same output as the one used in solidity
    const encoded = web3.eth.abi.encodeParameters(['bytes32', 'bytes20', 'uint256'], [previousHash, address, value])
    return web3.utils.sha3(encoded, { encoding: 'hex' })
  }

  it("Calculate locally the dump recursive hash", async function () {
    dumpRecursiveHash = ZERO_BYTES32;
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST4_ZEND_ADDRESS, TEST4_VALUE);
  });

  it("Deployment of the backup contract", async function () {
    admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory(utils.ZEND_VAULT_CONTRACT_NAME);
    ZendBackupVault = await factory.deploy(admin, BASE_MESSAGE_PREFIX);
  
    expect(await ZendBackupVault.message_prefix()).to.be.equal("");
  });

  it("Check store balances fails if cumulative hash checkpoint not set", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{ addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE }])).to.be.revertedWithCustomError(ZendBackupVault, "CumulativeHashCheckpointNotSet");
  });

  it("Set cumulative hash checkpoint in the backup contract", async function () {
    await ZendBackupVault.setCumulativeHashCheckpoint(dumpRecursiveHash);
  });

  it("Check store balances fails if ERC20 not set", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{ addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE }])).to.be.revertedWithCustomError(ZendBackupVault, "ERC20NotSet");
  });

  it("Deployment of the ERC-20 contract", async function () {
    var factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);

    erc20 = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, 
      MOCK_EMPTY_ADDRESS, await ZendBackupVault.getAddress(), MOCK_EMPTY_ADDRESS, MOCK_EMPTY_ADDRESS);
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
    var calcCumulativeHash = ZERO_BYTES32

    addressesValues.push({ addr: TEST1_ZEND_ADDRESS, value: TEST1_VALUE });
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST1_ZEND_ADDRESS, TEST1_VALUE);
    addressesValues.push({ addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE });
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

    addressesValues.push({ addr: TEST4_ZEND_ADDRESS, value: TEST4_VALUE });
    calcCumulativeHash = updateCumulativeHash(calcCumulativeHash, TEST4_ZEND_ADDRESS, TEST4_VALUE);

    await ZendBackupVault.batchInsert(calcCumulativeHash, addressesValues);

  });

  it("Check that first batch ZENs were minted", async function () {
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(TOTAL_ZEND_BALANCE);
  });

  it("Check store balances fails if cumulative hash checkpoint reached", async function () {
    var calcCumulativeHash = updateCumulativeHash(dumpRecursiveHash, TEST2_ZEND_ADDRESS, TEST2_VALUE);
    await expect(ZendBackupVault.batchInsert(calcCumulativeHash, [{ addr: TEST2_ZEND_ADDRESS, value: TEST2_VALUE }])).to.be.revertedWithCustomError(ZendBackupVault, "CumulativeHashCheckpointReached");
  });

  it("Check recursive hash from the contract matches with the local one", async function () {
    var cumulativeHashFromContract = await ZendBackupVault._cumulativeHash();
    expect(dumpRecursiveHash).to.equal(cumulativeHashFromContract);
  });

  it("Check that ZendVault cannot mint anymore", async function () {
    expect(await erc20.minters(await ZendBackupVault.getAddress())).to.be.false;
  });

  it("Claim of a P2PKH uncompressed", async function () {
    let zendVaultBalance = await erc20.balanceOf(await ZendBackupVault.getAddress());
    await ZendBackupVault.claimP2PKH(TEST1_DESTINATION_ADDRESS, "0x"+TEST1_SIGNATURE_HEX, TEST1_PUBLICKEY);

    expect(await erc20.balanceOf(TEST1_DESTINATION_ADDRESS)).to.equal(TEST1_VALUE);
    expect(await erc20.totalSupply(), "the total supply shouldn't change").to.equal(TOTAL_ZEND_BALANCE);
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(zendVaultBalance - BigInt(TEST1_VALUE));
  });

  it("Claim of a P2PKH compressed", async function () {
    let zendVaultBalance = await erc20.balanceOf(await ZendBackupVault.getAddress());
    await ZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, TEST2_PUBLICKEY);

    expect(await erc20.balanceOf(TEST2_DESTINATION_ADDRESS)).to.equal(TEST2_VALUE);
    expect(await erc20.totalSupply(), "the total supply shouldn't change").to.equal(TOTAL_ZEND_BALANCE);
    expect(await erc20.balanceOf(await ZendBackupVault.getAddress())).to.equal(zendVaultBalance - BigInt(TEST2_VALUE));
  });

  it("Correct signature but nothing to claim", async function () {
    await expect(ZendBackupVault.claimP2PKH(TEST3_DESTINATION_ADDRESS, "0x"+TEST3_SIGNATURE_HEX, TEST3_PUBLICKEY))
       .to.be.revertedWithCustomError(ZendBackupVault, "NothingToClaim")
  });

  it("Check double-claim protection", async function () {
    await expect(ZendBackupVault.claimP2PKH(TEST2_DESTINATION_ADDRESS, "0x"+TEST2_SIGNATURE_HEX, TEST2_PUBLICKEY))
         .to.be.revertedWithCustomError(ZendBackupVault, "NothingToClaim")

  });

  //MULTISIG TESTS
  async function _deployContractForMultisigTests(shouldInsertMultisigBalance) {
    if(!admin) admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory(utils.ZEND_VAULT_CONTRACT_NAME);    
    var ZendBackupVaultMultisig = await factory.deploy(admin, BASE_MESSAGE_PREFIX);

    var factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);

    
    erc20 = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, 
      MOCK_EMPTY_ADDRESS, await ZendBackupVaultMultisig.getAddress(), MOCK_EMPTY_ADDRESS, MOCK_EMPTY_ADDRESS);
    console.log(await ZendBackupVaultMultisig.getAddress());
    await ZendBackupVaultMultisig.setERC20(await erc20.getAddress());    
  
    if(shouldInsertMultisigBalance) {
      //load data for multisig test
      var dumpRecursiveHash = ZERO_BYTES32;
      dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST_MULTISIG_ADDRESS, TEST_MULTISIG_VALUE);
      await ZendBackupVaultMultisig.setCumulativeHashCheckpoint(dumpRecursiveHash); 
  
      let addressesValues = [{addr: TEST_MULTISIG_ADDRESS, value: TEST_MULTISIG_VALUE}];
      await ZendBackupVaultMultisig.batchInsert(dumpRecursiveHash, addressesValues); 
    }
    return ZendBackupVaultMultisig;
  }

  async function _checkBalance(vault, address, value) {
    let erc20Address = await vault.zenToken();
    let factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);
    let token = await factory.attach(erc20Address);
    let balance = await token.balanceOf(address);
    expect(balance).to.equal(value);
  }

  it("Multisig test - claim with signature 1 and 2", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_2, "0x"];
    let pubKeys = [TEST1_PUBLICKEY, TEST2_PUBLICKEY, ZERO_PUBLICKEY];
    
    await ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys);
    await _checkBalance(ZendBackupVaultMultisig, TEST_MULTISIG_DESTINATION_ADDRESS, TEST_MULTISIG_VALUE);
  });

  it("Multisig test - claim with signature 1 and 3", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeys = [TEST1_PUBLICKEY, ZERO_PUBLICKEY, TEST3_PUBLICKEY];

    await ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys);
    await _checkBalance(ZendBackupVaultMultisig, TEST_MULTISIG_DESTINATION_ADDRESS, TEST_MULTISIG_VALUE);
  });

  it("Multisig test - claim with signature 2 and 3", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_2, "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeys = [ZERO_PUBLICKEY, TEST2_PUBLICKEY, TEST3_PUBLICKEY];
    
    await ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys);
    await _checkBalance(ZendBackupVaultMultisig, TEST_MULTISIG_DESTINATION_ADDRESS, TEST_MULTISIG_VALUE);
  });

  it("Multisig test - claim fails with not enough signatures", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"];
    let pubKeys = [TEST1_PUBLICKEY, ZERO_PUBLICKEY, ZERO_PUBLICKEY];

    await expect(ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "InsufficientSignatures")
  });

  it("Multisig test - claim fails with duplicated signatures", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"];
    let pubKeys = [TEST1_PUBLICKEY, TEST2_PUBLICKEY, ZERO_PUBLICKEY];

    await expect(ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "InsufficientSignatures")
  });

  it("Multisig test - claim fails with duplicated pub keys", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"];
    let pubKeys = [TEST1_PUBLICKEY, TEST1_PUBLICKEY, ZERO_PUBLICKEY];

    await expect(ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "InvalidPublicKey")
  });

  it("Multisig test - claim fails with invalid signature array", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x"+TEST_MULTISIG_SIGNATURE_HEX_2]; //only two items
    let pubKeys = [TEST1_PUBLICKEY, TEST2_PUBLICKEY, ZERO_PUBLICKEY];

    await expect(ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "InvalidSignatureArrayLength")
  });

  it("Multisig test - double claim fails the second time", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(true);
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeys = [TEST1_PUBLICKEY, ZERO_PUBLICKEY, TEST3_PUBLICKEY];

    //legit claim
    await ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys);
    //double claim
    await expect(ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "NothingToClaim")
  });

  it("Multisig test - claim fails if nothing to claim", async function () {
    let  ZendBackupVaultMultisig = await _deployContractForMultisigTests(false); //with false doesn't load the data
    let signatures = ["0x"+TEST_MULTISIG_SIGNATURE_HEX_1, "0x", "0x"+TEST_MULTISIG_SIGNATURE_HEX_3];
    let pubKeys = [TEST1_PUBLICKEY, ZERO_PUBLICKEY, TEST3_PUBLICKEY];

    await expect( ZendBackupVaultMultisig.claimP2SH(TEST_MULTISIG_DESTINATION_ADDRESS, signatures, "0x"+TEST_MULTISIG_SCRIPT, pubKeys))
      .to.be.revertedWithCustomError(ZendBackupVaultMultisig, "CumulativeHashCheckpointNotSet")
  });

  //DIRECT TEST
  async function _deployContractForDirectTests() {
    if(!admin) admin = (await ethers.getSigners())[0];
    var factory = await ethers.getContractFactory(utils.ZEND_VAULT_CONTRACT_NAME);    
    var ZendBackupVaultDirect = await factory.deploy(admin, BASE_MESSAGE_PREFIX);

    var factory = await ethers.getContractFactory(utils.ZEN_TOKEN_CONTRACT_NAME);

    erc20 = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, 
      MOCK_EMPTY_ADDRESS, await ZendBackupVaultDirect.getAddress(), MOCK_EMPTY_ADDRESS, MOCK_EMPTY_ADDRESS);
    console.log(await ZendBackupVaultDirect.getAddress());
    await ZendBackupVaultDirect.setERC20(await erc20.getAddress()); 
   
    //load data for direct test
    var dumpRecursiveHash = ZERO_BYTES32;
    dumpRecursiveHash = updateCumulativeHash(dumpRecursiveHash, TEST_DIRECT_ZEND_ADDRESS, TEST_DIRECT_VALUE);
    await ZendBackupVaultDirect.setCumulativeHashCheckpoint(dumpRecursiveHash); 

    let addressesValues = [{addr: TEST_DIRECT_ZEND_ADDRESS, value: TEST_DIRECT_VALUE}];
    await ZendBackupVaultDirect.batchInsert(dumpRecursiveHash, addressesValues); 

    return ZendBackupVaultDirect;
  }

  it("Direct test - positive claim", async function () {
    let ZendBackupVaultDirect = await _deployContractForDirectTests(true);
    
    await ZendBackupVaultDirect.claimDirect(TEST_DIRECT_BASE_ADDRESS);
    await _checkBalance(ZendBackupVaultDirect, TEST_DIRECT_BASE_ADDRESS, TEST_DIRECT_VALUE);
  });

  it("Direct test - double claim fails the second time", async function () {
    let ZendBackupVaultDirect = await _deployContractForDirectTests(true);
    
    //legit claim
    await ZendBackupVaultDirect.claimDirect(TEST_DIRECT_BASE_ADDRESS);
    //double claim
    await expect(ZendBackupVaultDirect.claimDirect(TEST_DIRECT_BASE_ADDRESS)).to.be.revertedWithCustomError(ZendBackupVaultDirect, "NothingToClaim");
  });

  it("Direct test - fails if nothing to claim", async function () {
    let ZendBackupVaultDirect = await _deployContractForDirectTests(true);
    
    let notDirectAddress = TEST_MULTISIG_DESTINATION_ADDRESS;
    await expect(ZendBackupVaultDirect.claimDirect(notDirectAddress)).to.be.revertedWithCustomError(ZendBackupVaultDirect, "NothingToClaim");
  });});