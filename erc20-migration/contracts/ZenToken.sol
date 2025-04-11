// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "./interfaces/IERC20Mintable.sol";

/// @title ZEN official ERC-20 smart contract
/// @notice Minting role is granted in the constructor to the Backup Contracts, responsible for 
///         restoring EON and Zend balances
contract ZenToken is ERC20Capped, IERC20Mintable, AccessControl {

    // Create a new role identifier for the minter role
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 internal constant TOTAL_ZEN_SUPPLY = 21_000_000; 
    uint256 internal constant TOKEN_SIZE = 10 ** 18;

    error CallerNotMinter(address caller);

    constructor(string memory tokenName, string memory symbol, address _eonBackupContract, address _zendBackupContract) ERC20(tokenName, symbol) ERC20Capped(TOTAL_ZEN_SUPPLY * TOKEN_SIZE){
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

    function tokenSymbol() external view returns (string memory){
        return symbol();
    }
}