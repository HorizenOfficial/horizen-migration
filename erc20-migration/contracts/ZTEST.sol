// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IERC20Mintable.sol";

/// @title ZEN official ERC-20 smart contract
/// @notice Minting role is granted in the constructor to the Backup Contract, responsible to 
///         restore EON balances
contract ZTEST is ERC20, IERC20Mintable, AccessControl {

    // Create a new role identifier for the minter role
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error CallerNotMinter(address caller);

    constructor(address _backupContract) ERC20("ZTest", "ZTEST") {
        // Grant the minter role to a specified account
        _grantRole(MINTER_ROLE, _backupContract);
    }

    function mint(address to, uint256 amount) public {
        // Check that the calling account has the minter role
        if (!hasRole(MINTER_ROLE, msg.sender)) {
            revert CallerNotMinter(msg.sender);
        }
        _mint(to, amount);
    }
}