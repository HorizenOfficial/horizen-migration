// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import {VerificationLibrary} from  './VerificationLibrary.sol';
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZendBackupVault
/// @notice This contract is used to store balances from old ZEND Mainchain, and, once all are loaded, it allows manual claiming in the new chain.
///         In the constructor will receive an admin address (owner), the only entity authorized to perform load operations. Before loading all the accounts,
//          the cumulative hash calculated with all the accounts dump data must be set.
contract ZendBackupVault is Ownable {

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

    string private MESSAGE_CONSTANT;
    /// First part of the message to sign, needed for zen claim operation. It is composed by the token symbol + MESSAGE_CONSTANT
    string public message_prefix;

    error AddressNotValid();
    error CumulativeHashNotValid();
    error CumulativeHashCheckpointReached();
    error CumulativeHashCheckpointNotSet();
    error UnauthorizedOperation();
    error ERC20NotSet();
    error NothingToClaim(bytes20 zenAddress);
    event Claimed(address destAddress, bytes20 zenAddress, uint256 amount);

    /// @notice Smart contract constructor
    /// @param _admin  the only entity authorized to perform restore operations
    /// @param base_message  one of the parts of the message to sign for zen claim
    constructor(address _admin, string memory base_message) Ownable(_admin) {
        MESSAGE_CONSTANT = base_message;
    }

    /// @notice Set expected cumulative hash after all the data has been loaded
    /// @param _cumulativeHashCheckpoint  a cumulative recursive hash calculated with all the dump data.
    ///                                   Will be used to verify the consistency of the restored data, and as
    ///                                   a checkpoint to understand when all the data has been loaded and the claim 
    ///                                   can start
    function setCumulativeHashCheckpoint(bytes32 _cumulativeHashCheckpoint) public onlyOwner{
        if(_cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashNotValid();  
        if (cumulativeHashCheckpoint != bytes32(0)) revert UnauthorizedOperation();  //already set
        cumulativeHashCheckpoint = _cumulativeHashCheckpoint;
    }

    /// @notice Insert a new batch of tuples (bytes20, value) and updates the cumulative hash.
    ///         The zendAddresses in bs58 decoded format
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly
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
        message_prefix = string(abi.encodePacked(zenToken.tokenSymbol(), MESSAGE_CONSTANT));
    }

    /// @notice Claim a P2PKH balance.
    ///         destAddress is the receiver of the funds
    ///         hexSignature is the signature of the claiming message. Must be generated in a compressed format to claim a zend address
    ///         generated with the public key in compressed format, or uncompressed otherwise.
    ///         (Claiming message is predefined and composed by the concatenation of the message_prefix (token symbol + MESSAGE_CONSTANT) and the destAddress in lowercase string hex format)
    ///         pubKeyX and pubKeyY are the first 32 bytes and second 32 bytes of the signing key (we use always the uncompressed format here)
    ///         Note: we pass the pubkey explicitly because the extraction from the signature would be GAS expensive.
    function claimP2PKH(address destAddress, bytes memory hexSignature, bytes32 pubKeyX, bytes32 pubKeyY) public {
        if (cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashCheckpointNotSet();  
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked 
        if (address(zenToken) == address(0)) revert ERC20NotSet();
        if (address(destAddress) == address(0)) revert AddressNotValid();

        VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(hexSignature);
        bytes20 zenAddress;
        if (signature.v == 31 || signature.v == 32){
            //signature was compressed, also the zen address will be from the compressed format
             zenAddress = VerificationLibrary.pubKeyCompressedToZenAddress(pubKeyX, VerificationLibrary.signByte(pubKeyY));
        } else {
             zenAddress = VerificationLibrary.pubKeyUncompressedToZenAddress(pubKeyX, pubKeyY);
        }

        //check amount to claim
        uint256 amount = balances[zenAddress];
        if (amount == 0) revert NothingToClaim(zenAddress);

        //signed message suppose address in EIP-55 format for lowercase and uppercase chars
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(message_prefix, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);
        VerificationLibrary.verifyZendSignature(messageHash, signature, pubKeyX, pubKeyY);

        balances[zenAddress] = 0;
        zenToken.mint(destAddress, amount);
        emit Claimed(destAddress, zenAddress, amount);   
    }


}