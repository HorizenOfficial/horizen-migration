// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import {VerificationLibrary} from  './VerificationLibrary.sol';
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZTESTZendBackupVault
/// @notice This contract is used to store balances from old ZEND Mainchain, and, once all are loaded, allow  manual claimining in the new chain.
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

    // Final Cumulative Hash filled in the constructor, used for checkpoint, to unlock claim
    bytes32 public immutable cumulativeHashCheckpoint;

    IERC20Mintable public zenToken;

    string private constant MESSAGE_PREFIX = "ZENCLAIM";

    error AddressNotValid();
    error CumulativeHashNotValid();
    error CumulativeHashCheckpointReached();
    error UnauthorizedOperation();
    error ERC20NotSet();
    error NothingToClaim(bytes20 zenAddress);
    error InsufficientSignatures(uint256 number, uint256 required);
    error InvalidSignatureArrayLength();
    error InvalidPublicKeySize(uint256 size);
    event Claimed(address destAddress, bytes20 zenAddress, uint256 amount);

    /// @notice verify if we are in the state in which users can already claim
    modifier canClaim(address destAddress) {
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked 
        if (address(zenToken) == address(0)) revert ERC20NotSet();
        if (address(destAddress) == address(0)) revert AddressNotValid();
        _;
    }

    /// @notice Smart contract constructor
    /// @param _admin  the only entity authorized to perform restore operations
    /// @param _cumulativeHashCheckpoint  a cumulative recursive  hash calculated with all the dump data.
    ///                                   Will be used to verify the consistency of the restored data, and as
    ///                                   a checkpoint to understand when all the data has been loaded and the claim 
    ///                                   can start
    constructor(address _admin, bytes32 _cumulativeHashCheckpoint) Ownable(_admin) {
        if(_cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashNotValid();   
        _cumulativeHash = bytes32(0);
        cumulativeHashCheckpoint = _cumulativeHashCheckpoint;
    }

    /// @notice Insert a new batch of tuples (bytes20, value) and updates the cumulative hash.
    ///         The zendAddresses in bs58 decoded format
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly)
    function batchInsert(bytes32 expectedCumulativeHash, AddressValue[] memory addressValues) public onlyOwner {
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
            //signature was compreesed, also the zen address will be from the compressed format
             zenAddress = VerificationLibrary.pubKeyCompressedToZenAddress(pubKeyX, VerificationLibrary.signByte(pubKeyY));
        }else{
             zenAddress = VerificationLibrary.pubKeyUncompressedToZenAddress(pubKeyX, pubKeyY);
        }

        //check amount to claim
        uint256 amount = balances[zenAddress];
        if (amount == 0) revert NothingToClaim(zenAddress);

        //signed message suppose address in EIP-55 format for lowercase and uppercase chars
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(MESSAGE_PREFIX, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);
        VerificationLibrary.verifyZendSignature(messageHash, signature, pubKeyX, pubKeyY);

        balances[zenAddress] = 0;
        zenToken.mint(destAddress, amount);
        emit Claimed(destAddress, zenAddress, amount);   
    }
    
    /// @notice Claim a P2SH balance.
    ///         destAddress is the receiver of the funds
    ///         hexSignatures is the array of the signatures of the claiming message. Must be generated in a compressed format to claim a zend address
    ///
    ///         IMPORTANT: the array should have as length the number of public keys in the script. The signature in the "i" position should be the signature for the "i"
    ///         pub key in the order it appears in the script. If the signature is not present for that key, it could be zero or invalid signature.
    ///         This is to avoid duplicated signatures without expensive checks.
    ///         
    ///         script is the script to claim, from which pubKeys will be extractted
    ///         (Claiming message is predefined and composed by the string 'ZENCLAIM' concatenated with the destAddress in lowercase string hex format)
    function claimP2SH(address destAddress, bytes[] memory hexSignatures, bytes20 zenAddress, bytes memory script) public canClaim(destAddress) {

        uint256 minSignatures = uint256(uint8(script[0])) - 80;
        (bytes32[] memory pubKeysX, bytes32[] memory pubKeysY) = _extractPubKeysFromScript(script);
        if(hexSignatures.length != pubKeysX.length) revert InvalidSignatureArrayLength(); //check method doc
        _checkZenAddressFromScript(zenAddress, script);
        
        //check amount to claim
        uint256 amount = balances[zenAddress];
        if (amount == 0) revert NothingToClaim(zenAddress);

        //signed message suppose address in EIP-55 format for lowercase and uppercase chars
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(MESSAGE_PREFIX, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);

        //check signatures
        uint256 validSignatures;
        uint256 i;
        while(i != hexSignatures.length) {
            VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(hexSignatures[i]);
            //check doc: we suppose the signature in i position belonging to the pub key in i position in the script
            if(VerificationLibrary.verifyZendSignatureBool(messageHash, signature, pubKeysX[i], pubKeysY[i])) {
                ++validSignatures;
            }
            unchecked { ++i; }
        }

        if(validSignatures < minSignatures) revert InsufficientSignatures(validSignatures, minSignatures); //insufficient signatures

        balances[zenAddress] = 0;
        zenToken.mint(destAddress, amount);
        emit Claimed(destAddress, zenAddress, amount);   
    }

    /// @notice extract public keys from multisignature script. Two separate arrays are returned since it should be a 64-bit
    function _extractPubKeysFromScript(bytes memory script) internal pure returns(bytes32[] memory, bytes32[] memory) {
        uint256 total = uint256(uint8(script[script.length - 2])) - 80;
        uint256 pos = 1;
        bytes32[] memory pubKeysX = new bytes32[](total);
        bytes32[] memory pubKeysY = new bytes32[](total);

        uint256 i;
        while(i < total) {
            uint256 nextPubKeySize = uint256(uint8(script[pos]));
            ++pos;
            if(nextPubKeySize != HORIZEN_COMPRESSED_PUBLIC_KEY_LENGTH && nextPubKeySize != HORIZEN_UNCOMPRESSED_PUBLIC_KEY_LENGTH) revert InvalidPublicKeySize(nextPubKeySize);

            //extract key
            //first 32 btyes
            bytes32 firstPart;
            assembly {
                let resultPtr := mload(0x40)
                let sourcePtr := add(script, 0x20)
                let offset := add(sourcePtr, pos)

                mstore(resultPtr, mload(offset))
                firstPart := mload(resultPtr)
            }
            pubKeysX[i] = firstPart;

            //second part
            bytes memory secondPart = new bytes(nextPubKeySize);
            uint256 secondPartStart = pos + 32;
            uint256 secondPartLength = nextPubKeySize - 32;
            assembly {
                let resultPtr := add(secondPart, 0x20)
                let sourcePtr := add(script, 0x20)
                let offset := add(sourcePtr, secondPartStart)
                let end := add(offset, secondPartLength)

                for { let j := offset } lt(j, end) { j := add(j, 1) } {
                    mstore(resultPtr, byte(0, mload(j))) 
                    resultPtr := add(resultPtr, 1)
                }
            }

            if (secondPart.length == 1) {
                pubKeysY[i] = bytes32(secondPart[0]);
            } else {
                pubKeysY[i] = bytes32(secondPart);
            }

            pos += nextPubKeySize;
            unchecked { ++i; }
        }

        return (pubKeysX, pubKeysY);
    }

    /// @notice extract zen address from multisignature script
    function _checkZenAddressFromScript(bytes20 zenAddress, bytes memory script) internal pure {
        bytes32 scriptHash = sha256(script);
        scriptHash = ripemd160(abi.encode(scriptHash));
        //prefix is first two bytes
        bytes memory prefix = new bytes(2);
        prefix[0] = zenAddress[0];
        prefix[1] = zenAddress[1];
        bytes memory withPrefix = abi.encode(prefix, scriptHash);
        //checksum (double hash)
        bytes32 checksum_sha = sha256(withPrefix);
        checksum_sha = sha256(abi.encode(checksum_sha));
        //checksum is first 4 bytes
        bytes memory checksum = new bytes(4);
        checksum[0] = checksum_sha[0];
        checksum[1] = checksum_sha[1];
        checksum[2] = checksum_sha[2];
        checksum[3] = checksum_sha[3];

        bytes memory concatenated = abi.encode(withPrefix, checksum);
        if(bytes20(concatenated) != zenAddress) revert AddressNotValid();
    }



}