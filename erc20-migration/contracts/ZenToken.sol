// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ZEN official ERC-20 smart contract
/// @notice Minting role is granted in the constructor to the Backup Contract, responsible for 
///         restoring EON balances
contract ZenToken is ERC20, AccessControl {

    // Create a new role identifier for the minter role
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error CallerNotMinter(address caller);

    constructor(string memory tokenName, string memory tokenSymbol, address _eonBackupContract, address _zendBackupContract) ERC20(tokenName, tokenSymbol) {
        // Grant the minter role to a specified account
        _grantRole(MINTER_ROLE, _eonBackupContract);
        _grantRole(MINTER_ROLE, _zendBackupContract);
    }

    function mint(address to, uint256 amount) public {
        // Check that the calling account has the minter role
        if (!hasRole(MINTER_ROLE, msg.sender)) {
            revert CallerNotMinter(msg.sender);
        }
        _mint(to, amount);
    }

 }