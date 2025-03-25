// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import {VerificationLibrary} from  './VerificationLibrary.sol';
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title ZTESTZendBackupVault
/// @notice This contract is used to store balances from old ZEND Mainchain, and, once all are loaded, allow  manual claimining in the new chain.
///         In the constructor will receive an admin address, the only entity authorized to perform load operations, and a cumulative hash 
///         calcolated with all the dump data.
contract ZTESTZendBackupVault  {
    
    // Map of the claimable balances.
    // The key is the zendAddress in bs58 decoded format
    mapping(bytes20 => uint256) public balances;
       
    // Cumulative Hash calculated
    bytes32 public _cumulativeHash;

    // Final Cumulative Hash filled in the constructor, used for checkpoint, to unlock claim
    bytes32 public cumulativeHashCheckpoint;
       
    // admin authority
    address public admin;

    IERC20Mintable public zenToken;

    string private constant MESSAGE_PREFIX = "ZENCLAIM";

    error AddressNotValid();
    error CumulativeHashNotValid();
    error UnauthorizedOperation();
    error ArrayLengthMismatch();
    error ERC20NotSet();
    error NothingToClaim(bytes20 zenAddress);
    event Claimed(address destAddress, bytes20 zenAddress, uint256 amount);

    /// @notice Smart contract constructor
    /// @param _admin  the only entity authorized to perform restore operations
    /// @param _cumulativeHashCheckpoint  a cumulative recursive  hash calculated with all the dump data.
    ///                                   Will be used to verify the consistency of the restored data, and as
    ///                                   a checkpoint to understand when all the data has been loaded and the claim 
    ///                                   can start
    constructor(address _admin, bytes32 _cumulativeHashCheckpoint) {
        if(_admin == address(0)) revert AddressNotValid();
        if(_cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashNotValid();   
        admin = _admin;
        _cumulativeHash = bytes32(0);
        cumulativeHashCheckpoint = _cumulativeHashCheckpoint;
    }

    /// @notice Insert a new batch of tuples (bytes20, value) and updates the cumulative hash.
    ///         The zendAddresses in bs58 decoded format
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly)
    function batchInsert(bytes32 expectedCumulativeHash, bytes20[] memory zendAddresses, uint256[] memory values) public {
        if (msg.sender != admin) revert UnauthorizedOperation();     
        if (zendAddresses.length != values.length) revert ArrayLengthMismatch();
        uint256 i;
        bytes32 auxHash = _cumulativeHash;
        while (i != zendAddresses.length) {
            balances[zendAddresses[i]] = values[i];
            auxHash = keccak256(abi.encode(auxHash, zendAddresses[i], values[i]));
            unchecked { ++i; }
        }
        _cumulativeHash = auxHash;
        if (expectedCumulativeHash != _cumulativeHash) revert CumulativeHashNotValid();   
    }

    /// @notice Set official ZEN ERC-20 smart contract that will be used for minting
    function setERC20(address addr) public {
        if (msg.sender != admin) revert UnauthorizedOperation();     
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
    function claimP2PKH(address destAddress, bytes memory hexSignature, bytes32 pubKeyX, bytes32 pubKeyY) public {
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked 
        if (address(zenToken) == address(0)) revert ERC20NotSet();
        if (address(destAddress) == address(0)) revert AddressNotValid();

        VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(hexSignature);
        bytes20 zenAddress;
        if (signature.v == 31 || signature.v == 32){
            //signature was compreesed, also the zen address will be from the compressed format
             zenAddress = VerificationLibrary.pubKeyCompressedToZenAddress(pubKeyX, VerificationLibrary.signByte(pubKeyY));
        }else{
             zenAddress = VerificationLibrary.pubKeyUncompressedToZenAddress(pubKeyX, pubKeyY);
        }
        //signed message suppose address in EIP-55 format for lowercase and uppercase chars
        string memory asString = Strings.toChecksumHexString(destAddress);
        string memory strMessageToSign = string(abi.encodePacked(MESSAGE_PREFIX, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);
        VerificationLibrary.verifyZendSignature(messageHash, signature, pubKeyX, pubKeyY);

        uint256 amount = balances[zenAddress];
        if (amount == 0) revert NothingToClaim(zenAddress);
        balances[zenAddress] = 0;
        zenToken.mint(destAddress, amount);
        emit Claimed(destAddress, zenAddress, amount);   
    }


}