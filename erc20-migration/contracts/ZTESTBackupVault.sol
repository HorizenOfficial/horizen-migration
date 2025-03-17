// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";

/// @title ZTESTBackupVault
/// @notice This contract is used to store balances from old EON chain, and, once all are loaded, distribute corresponding ZEN in the new chain.
///         In the constructor will receive an admin address, the only entity authorized to perform operations, and a cumulative hash 
///         calcolated with all the dump data.
contract ZTESTBackupVault  {

    struct Balances {
        uint256 amount;
        bool distributed;
    }
    
    // Map of the balances
    mapping(address => Balances) public balances;
    
    // Array to track inserted addresses
    address[] private addressList;
    
    // Cumulative Hash calculated
    bytes32 private _cumulativeHash;

    // Final Cumulative Hash filled in the constructor, used for checkpoint, to unlock distribution
    bytes32 private cumulativeHashCheckpoint;
       
    // admin authority
    address public admin;
    
    // Tracks rewarded addresses (next address to reward)
    uint256 private nextRewardIndex;

    IERC20Mintable public zenToken;

    error AddressNotValid();
    error CumulativeHashNotValid();
    error UnauthorizedOperation();
    error ArrayLengthMismatch();
    error ERC20NotSet();
    error NothingToDistribute();


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
        nextRewardIndex = 0;
    }

    /// @notice Insert a new bach of tuples (address, value) and updates the cumulative hash.
    ///         To guarantee the same algorithm is applied, the expected cumulativeHash after the batch processing must be provided explicitly)
    function batchInsert(bytes32 expectedCumulativeHash, address[] memory addresses, uint256[] memory values) public {
        if (msg.sender != admin) revert UnauthorizedOperation();               
        if (addresses.length != values.length) revert ArrayLengthMismatch();
        uint256 i;
        while (i != addresses.length) {
            balances[addresses[i]] = Balances({amount: values[i], distributed: false});
            addressList.push(addresses[i]);
            _cumulativeHash = keccak256(abi.encode(_cumulativeHash, addresses[i], values[i]));
            unchecked { ++i; }
        }
        if (expectedCumulativeHash != _cumulativeHash) revert CumulativeHashNotValid();   
    }

    /// @notice Return the balance data associated with an address
    function getBalance(address addr) public view returns (Balances memory) {
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
    
    /// @notice Distribute ZEN for the next (max) 500 addresses, until we have reached the end of the list
    ///         Can be executed only when we have reached the planned cumulativeHashCheckpoint (meaning all data has been loaded)
    function distribute() public  {
        if (msg.sender != admin) revert UnauthorizedOperation();     
        if (_cumulativeHash != cumulativeHashCheckpoint) revert CumulativeHashNotValid(); //Loaded data not matching - distribution locked
        if (address(zenToken) == address(0)) revert ERC20NotSet();
        if (nextRewardIndex == addressList.length) revert NothingToDistribute();
        
        uint256 count = 0;
        while (nextRewardIndex < addressList.length && count < 500) {
            address addr = addressList[nextRewardIndex];      
            if (balances[addr].amount > 0 && balances[addr].distributed == false) {
                zenToken.mint(addr, balances[addr].amount);
                balances[addr].distributed = true;
            }
            nextRewardIndex++;
            count++;
        }
    }

    /// @notice Return true if admin is able to distribute more
    function moreToDistribute() public view returns (bool) {
        if (msg.sender != admin) revert UnauthorizedOperation();     
        return _cumulativeHash != bytes32(0) &&
                _cumulativeHash == cumulativeHashCheckpoint && 
                  nextRewardIndex <  addressList.length;
    }
}