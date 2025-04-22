// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

/// @title ZEN official ERC-20 smart contract
/// @notice Minting role is granted in the constructor to the Vault Contracts, responsible for
///         restoring EON and Zend balances. 

contract ZenToken is ERC20Capped, AccessControl {

    // Create a new role identifier for the minter role
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 internal constant TOTAL_ZEN_SUPPLY = 21_000_000;
    uint256 internal constant TOKEN_SIZE = 10 ** 18;

    address public horizenFoundation;
    address public horizenFoundationVested;
    address public horizenDao;
    address public horizenDaoVested;

    uint8 notificationCounter;

    error CallerNotMinter(address caller);


    modifier canMint() {
        // Check that the calling account has the minter role
        if (!hasRole(MINTER_ROLE, msg.sender)) {
            revert CallerNotMinter(msg.sender);
        }
        _;
    }


    /// @notice Smart contract constructor
    /// @param tokenName Name of the token
    /// @param tokenSymbol Ticker of the token
    /// @param _eonBackupContract Address of EON Vault contract
    /// @param _zendBackupContract Address of ZEND Vault contract
    /// @param _horizenFoundation Address who will receive the remaining portion of Zen reserved to Foundation (immediately available)
    /// @param _horizenFoundationVested Address who will receive the remaining portion of Zen to the Foundation (with locking period)
    /// @param _horizenDao Address who will receive the remaining portion of Zen reserved to the DAO (immediately available)
    /// @param _horizenDaoVested Address who will receive the remaining portion  of Zen reserved to the DAO (with locking period)
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address _eonBackupContract,
        address _zendBackupContract, 
        address _horizenFoundation,
        address _horizenFoundationVested,
        address _horizenDao,
        address _horizenDaoVested
    ) ERC20(tokenName, tokenSymbol) ERC20Capped(TOTAL_ZEN_SUPPLY * TOKEN_SIZE) {

        // Grant the minter role to a specified account
        _grantRole(MINTER_ROLE, _eonBackupContract);
        _grantRole(MINTER_ROLE, _zendBackupContract);
        horizenFoundation = _horizenFoundation;
        horizenFoundationVested = _horizenFoundationVested;
        horizenDao = _horizenDao;  
        horizenDaoVested = _horizenDaoVested;
    }

    function mint(address to, uint256 amount) public canMint {
        _mint(to, amount);
    }

    function notifyMintingDone() public canMint {
        _revokeRole(MINTER_ROLE, msg.sender);
        unchecked {++notificationCounter;}
        if (notificationCounter == 2){
            _mint(horizenFoundation, cap() - totalSupply());
        }
    }


}

