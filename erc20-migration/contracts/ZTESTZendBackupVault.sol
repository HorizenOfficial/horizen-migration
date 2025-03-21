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

    struct Balances {
        uint256 amount;
        bool distributed;
    }
    
    // Map of the balances
    mapping(bytes20 => Balances) public balances;
       
    // Cumulative Hash calculated
    bytes32 private _cumulativeHash;

    // Final Cumulative Hash filled in the constructor, used for checkpoint, to unlock claim
    bytes32 private cumulativeHashCheckpoint;
       
    // admin authority
    address public admin;

    IERC20Mintable public zenToken;

    error AddressNotValid();
    error CumulativeHashNotValid();
    error UnauthorizedOperation();
    error ArrayLengthMismatch();
    error ERC20NotSet();
    error NothingToDistribute();

    event Claimed(address destAddress, bytes20 zenAddress, uint256 amount);
    error NothingToClaim(bytes20 zenAddress);
    error AlreadyClaimed(bytes20 zenAddress);

    /// @notice Smart contract constructor
    /// @param _admin  the only entity authorized to performe restore and distribution operations
    /// @param _cumulativeHashCheckpoint  a cumulative recursive  hash calcolated with all the dump data.
    ///                                   Will be used to verify the consinstency of the restored data, and as
    ///                                   a checkpoint to understand when all the data has been loaded and the distribution 
    ///                                   can start
    constructor(address _admin, bytes32 _cumulativeHashCheckpoint) {
        if(_admin == address(0)) revert AddressNotValid();
        if(_cumulativeHashCheckpoint == bytes32(0)) revert CumulativeHashNotValid();   
        admin = _admin;
        _cumulativeHash = bytes32(0);
        cumulativeHashCheckpoint = _cumulativeHashCheckpoint;
    }

    /// @notice Insert a new bach of tuples (bytes20, value) and updates the cumulative hash.
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly)
    function batchInsert(bytes32 expectedCumulativeHash, bytes20[] memory addresses, uint256[] memory values) public {
        if (msg.sender != admin) revert UnauthorizedOperation();               
        if (addresses.length != values.length) revert ArrayLengthMismatch();
        uint256 i;
        while (i != addresses.length) {
            balances[addresses[i]] = Balances({amount: values[i], distributed: false});
            _cumulativeHash = keccak256(abi.encode(_cumulativeHash, addresses[i], values[i]));
            unchecked { ++i; }
        }
        if (expectedCumulativeHash != _cumulativeHash) revert CumulativeHashNotValid();   
    }

    /// @notice Return the balance data associated with an address
    function getBalance(bytes20 addr) public view returns (Balances memory) {
        return balances[addr];
    }
    
    /// @notice Return the cumulativeHash  calculated so far
    function getCumulativeHash() public view returns (bytes32) {
        return _cumulativeHash;
    }

    /// @notice Set official ZEN ERC-20 smart contract that will be used for minting
    function setERC20(address addr) public {
        if (msg.sender != admin) revert UnauthorizedOperation();     
        if (address(zenToken) != address(0)) revert UnauthorizedOperation();  //ERC-20 address already set
        if(addr == address(0)) revert AddressNotValid();
        zenToken = IERC20Mintable(addr);
    }
    
    function claimP2PKH(address destAddress, bytes memory decodifiedBase64Signature, bytes32 pubKeyX, bytes32 pubKeyY) public {
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked 
        
        VerificationLibrary.Signature memory signature = VerificationLibrary.parseZendSignature(decodifiedBase64Signature);
        bytes20 zenAddress;
        if (signature.v == 31 || signature.v == 32){
             zenAddress = VerificationLibrary.pubKeyCompressedToZenAddress(pubKeyX, VerificationLibrary.signByte(pubKeyY));
        }else{
             zenAddress = VerificationLibrary.pubKeyUncompressedToZenAddress(pubKeyX, pubKeyY);
        }
        string memory asString = Strings.toHexString(uint256(uint160(destAddress)), 20);
        string memory zenclaimTag = "ZENCLAIM";
        string memory strMessageToSign = string(abi.encodePacked(zenclaimTag, asString));
        bytes32 messageHash = VerificationLibrary.createMessageHash(strMessageToSign);
        VerificationLibrary.verifyZendSignature(messageHash, signature, pubKeyX, pubKeyY);

        if (balances[zenAddress].distributed == true) revert AlreadyClaimed(zenAddress);
        uint256 amount = balances[zenAddress].amount;
        if(amount == 0) revert NothingToClaim(zenAddress);
        zenToken.mint(destAddress, amount);
        balances[zenAddress].distributed = true;
        emit Claimed(destAddress, zenAddress, amount);   
    }


}