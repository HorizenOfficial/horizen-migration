// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import {VerificationLibrary} from  './VerificationLibrary.sol';
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZTESTZendBackupVault
/// @notice This contract is used to store balances from old ZEND Mainchain, and, once all are loaded, allows  manual claiming in the new chain.
///         In the constructor will receive an admin address (owner), the only entity authorized to perform load operations, and a cumulative hash 
///         calcolated with all the dump data.
contract ZTESTZendBackupVault is Ownable {
    uint256 constant HORIZEN_UNCOMPRESSED_PUBLIC_KEY_LENGTH = 65;
    uint256 constant HORIZEN_COMPRESSED_PUBLIC_KEY_LENGTH = 33;

    struct AddressValue {
        bytes20 addr;
        uint256 value;
    }
    
    // Map of the claimable balances.
    // The key is the zendAddress in bs58 decoded format
    mapping(bytes20 => uint256) public balances;
       
    // Cumulative Hash calculated
    bytes32 public _cumulativeHash;

    // Final expected Cumulative Hash, used for checkpoint, to unlock claim
    bytes32 public cumulativeHashCheckpoint;

    IERC20Mintable public zenToken;

    string private constant MESSAGE_PREFIX = "ZENCLAIM";

    error AddressNotValid();
    error CumulativeHashNotValid();
    error CumulativeHashCheckpointReached();
    error CumulativeHashCheckpointNotSet();
    error UnauthorizedOperation();
    error ERC20NotSet();
    error NothingToClaim(bytes20 zenAddress);
    error InsufficientSignatures(uint256 number, uint256 required);
    error InvalidSignatureArrayLength();
    error InvalidPublicKeysArraysLength();
    error InvalidScriptLength();
    error InvalidPublicKeySize(uint256 size);
    error InvalidPublicKey(uint256 index, uint256 xOrY, bytes32 expected, bytes32 received);
    event Claimed(address destAddress, bytes20 zenAddress, uint256 amount);

    /// @notice verify if we are in the state in which users can already claim
    modifier canClaim(address destAddress) {
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked 
        if (address(zenToken) == address(0)) revert ERC20NotSet();
        if (address(destAddress) == address(0)) revert AddressNotValid();
        if (cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashCheckpointNotSet();
        _;
    }

    /// @notice Smart contract constructor
    /// @param _admin  the only entity authorized to perform restore operations
    constructor(address _admin) Ownable(_admin) {
    }

    /// @notice Set expected cumulative hash after all the data has been loaded
    /// @param _cumulativeHashCheckpoint  a cumulative recursive  hash calculated with all the dump data.
    ///                                   Will be used to verify the consistency of the restored data, and as
    ///                                   a checkpoint to understand when all the data has been loaded and the claim 
    ///                                   can start
    function setCumulativeHashCeckpoint(bytes32 _cumulativeHashCheckpoint) public onlyOwner{
        if(_cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashNotValid();  
        if (cumulativeHashCheckpoint != bytes32(0)) revert UnauthorizedOperation();  //already set
        cumulativeHashCheckpoint = _cumulativeHashCheckpoint;
    }

    /// @notice Insert a new batch of tuples (bytes20, value) and updates the cumulative hash.
    ///         The zendAddresses in bs58 decoded format
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly)
    function batchInsert(bytes32 expectedCumulativeHash, AddressValue[] memory addressValues) public onlyOwner {
        if (cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashCheckpointNotSet();  
        uint256 i;
        bytes32 auxHash = _cumulativeHash;
        if(_cumulativeHash == cumulativeHashCheckpoint) revert CumulativeHashCheckpointReached();
        while (i != addressValues.length) {
            balances[addressValues[i].addr] = addressValues[i].value;
            auxHash = keccak256(abi.encode(auxHash, addressValues[i].addr, addressValues[i].value));
            unchecked { ++i; }
        }
        _cumulativeHash = auxHash;
        if (expectedCumulativeHash != _cumulativeHash) revert CumulativeHashNotValid();   
    }

    /// @notice Set official ZEN ERC-20 smart contract that will be used for minting
    function setERC20(address addr) public onlyOwner {
        if (address(zenToken) != address(0)) revert UnauthorizedOperation();  //ERC-20 address already set
        if(addr == address(0)) revert AddressNotValid();
        zenToken = IERC20Mintable(addr);
    }

    /// @notice Internal claim function, to reuse the code between P2PKH and P2PSH
    function _claim(address destAddress, bytes20 zenAddress) internal {
        //check amount to claim
        uint256 amount = balances[zenAddress];
        if (amount == 0) revert NothingToClaim(zenAddress);
        
        balances[zenAddress] = 0;
        zenToken.mint(destAddress, amount);
        emit Claimed(destAddress, zenAddress, amount);
    }

    /// @notice Claim a P2PKH balance.
    ///         destAddress is the receiver of the funds
    ///         hexSignature is the signature of the claiming message. Must be generated in a compressed format to claim a zend address
    ///         generated with the public key in compressed format, or uncompressed otherwise.
    ///         (Claiming message is predefined and composed by the string 'ZENCLAIM' concatenated with the destAddress in lowercase string hex format)
    ///         pubKeyX and pubKeyY are the first 32 bytes and second 32 bytes of the signing key (we use always the uncompressed format here)
    ///         Note: we pass the pubkey explicitly because the extraction from the signature would be GAS expensive.
    function claimP2PKH(address destAddress, bytes memory hexSignature, bytes32 pubKeyX, bytes32 pubKeyY) public canClaim(destAddress) {
        VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(hexSignature);
        bytes20 zenAddress;
        if (signature.v == 31 || signature.v == 32){
            //signature was compressed, also the zen address will be from the compressed format
             zenAddress = VerificationLibrary.pubKeyCompressedToZenAddress(pubKeyX, VerificationLibrary.signByte(pubKeyY));
        }else{
             zenAddress = VerificationLibrary.pubKeyUncompressedToZenAddress(pubKeyX, pubKeyY);
        }

        //address in signed message should respect EIP-55 format (https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md)
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(MESSAGE_PREFIX, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);
        VerificationLibrary.verifyZendSignature(messageHash, signature, pubKeyX, pubKeyY);

        _claim(destAddress, zenAddress);
    }
    
    /// @notice Claim a P2SH balance.
    ///         destAddress is the receiver of the funds
    ///         hexSignatures is the array of the signatures of the claiming message. Must be generated in a compressed format if the public keys in the script are in compressed format, or uncompressed otherwise.
    ///
    ///         IMPORTANT: the array should have as length the number of public keys in the script. The signature in the "i" position should be the signature for the "i"
    ///         pub key in the order it appears in the script. If the signature is not present for that key, it should be empty.
    ///         This is to avoid duplicated signatures without expensive checks.
    ///         
    ///         script is the script to claim, from which pubKeys will be extracted
    ///         pubKeysX and pubKeysY are the first 32 bytes and second 32 bytes of the signing keys for each one in the script (we use always the uncompressed format here)
    ///         If the signature is not present for that key, the pub keys x and y should be bytes32(0)
    ///         (Claiming message is predefined and composed by the string 'ZENCLAIM' concatenated with the destAddress in lowercase string hex format)
    function claimP2SH(address destAddress, bytes[] memory hexSignatures, bytes memory script, bytes32[] memory pubKeysX, bytes32[] memory pubKeysY) public canClaim(destAddress) {

        uint256 minSignatures = uint256(uint8(script[0])) - 80;
        _verifyPubKeysFromScript(script, pubKeysX, pubKeysY);
        if(hexSignatures.length != pubKeysX.length) revert InvalidSignatureArrayLength(); //check method doc
        bytes20 zenAddress = _extractZenAddressFromScript(script);

        //address in signed message should respect EIP-55 format (https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md)
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(MESSAGE_PREFIX, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);

        //check signatures
        uint256 validSignatures;
        uint256 i;
        while(i != hexSignatures.length && validSignatures < minSignatures) {
            if(pubKeysX[i] != bytes32(0) && hexSignatures[i].length != 0) {
                VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(hexSignatures[i]);
                //check doc: we suppose the signature in i position belonging to the pub key in i position in the script
                if(VerificationLibrary.verifyZendSignatureBool(messageHash, signature, pubKeysX[i], pubKeysY[i])) {
                    unchecked { ++validSignatures; }
                }
            }
            unchecked { ++i; }
        }

        if(validSignatures < minSignatures) revert InsufficientSignatures(validSignatures, minSignatures); //insufficient signatures

        _claim(destAddress, zenAddress);
    }

    /// @notice verify public keys from multisignature script
    function _verifyPubKeysFromScript(bytes memory script, bytes32[] memory pubKeysX, bytes32[] memory pubKeysY) internal pure {
        if(script.length < 2) revert InvalidScriptLength();
        uint256 total = uint256(uint8(script[script.length - 2])) - 80;

        if(pubKeysX.length != pubKeysY.length || pubKeysX.length != total) revert InvalidPublicKeysArraysLength();
        uint256 pos = 1;

        uint256 i;
        while(i < total) {
            uint256 nextPubKeySize = uint256(uint8(script[pos]));
            unchecked { ++pos; }
            if(nextPubKeySize != HORIZEN_COMPRESSED_PUBLIC_KEY_LENGTH && nextPubKeySize != HORIZEN_UNCOMPRESSED_PUBLIC_KEY_LENGTH) revert InvalidPublicKeySize(nextPubKeySize);

            //extract key
            //first 32 bytes
            bytes32 firstPart;
            uint256 firstPartStart = pos+1;
            assembly {
                let resultPtr := mload(0x40)
                let sourcePtr := add(script, 0x20)
                let offset := add(sourcePtr, firstPartStart)

                mstore(resultPtr, mload(offset))
                firstPart := mload(resultPtr)
            }
            if(pubKeysX[i] != bytes32(0) && pubKeysX[i] != firstPart) revert InvalidPublicKey(i, 0, firstPart, pubKeysX[i]);

            //second part
            if(nextPubKeySize == HORIZEN_UNCOMPRESSED_PUBLIC_KEY_LENGTH) { //uncompressed case
                bytes32 secondPart;
                uint256 secondPartStart = pos + 33;
                assembly {
                    let resultPtr := mload(0x40)
                    let sourcePtr := add(script, 0x20)
                    let offset := add(sourcePtr, secondPartStart)

                    mstore(resultPtr, mload(offset))
                    secondPart := mload(resultPtr)
                }
                if(pubKeysY[i] != bytes32(0) && pubKeysY[i] != secondPart) revert InvalidPublicKey(i, 1, secondPart, pubKeysY[i]);
            }
            //in compressed case, we just check first part

            pos += nextPubKeySize;
            unchecked { ++i; }
        }
    }

    /// @notice extract zen address from multisignature script
    function _extractZenAddressFromScript(bytes memory script) internal pure returns(bytes20) {
        bytes32 scriptHash = sha256(script);
        scriptHash = ripemd160(abi.encode(scriptHash));
        return bytes20(scriptHash); 
    }
}