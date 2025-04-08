// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import "./EONBackupVault.sol";
import "./ZendBackupVault.sol";
import "./ZenToken.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZenMigrationFactory
/// @notice  This is a factory contract responsible for deploying the 3 contracts used for ZEN migration. 
contract ZenMigrationFactory is Ownable {

    struct MigrationContracts {
        IERC20Mintable token;
        EONBackupVault eonVault;
        ZendBackupVault zendVault;
    }

    error TokenAlreadyExists(string tokenSymbol);

    /// Map of migration contracts related to a token with the specified symbol
    mapping(string => MigrationContracts) public migrationContracts;
    string[] public tokenSymbols;

    /// @notice Smart contract constructor
    /// @param _admin The only entity authorized to deploy migration contracts and the future owner of the contracts themselves
    constructor(address _admin) Ownable(_admin) {}


    /// @notice Deploys the migration contracts and the ERC20 contract related to a specific token.  
    /// @param tokenName Name of the token
    /// @param tokenSymbol Token ticker
    function deployMigrationContracts(
        string memory tokenName,
        string memory tokenSymbol
    ) public onlyOwner {
        if (address(migrationContracts[tokenSymbol].token) != address(0)) {
            revert TokenAlreadyExists(tokenSymbol);
        }

        tokenSymbols.push(tokenSymbol);

        EONBackupVault eonVault = new EONBackupVault(address(this));
        ZendBackupVault zendVault = new ZendBackupVault(address(this));
        ZenToken token = new ZenToken(
            tokenName,
            tokenSymbol,
            address(eonVault),
            address(zendVault)
        );

        migrationContracts[tokenSymbol] = MigrationContracts(
            token,
            eonVault,
            zendVault
        );
        eonVault.setERC20(address(token));
        zendVault.setERC20(address(token));

        eonVault.transferOwnership(owner());
        zendVault.transferOwnership(owner());
    }

    /// @notice Returns the number of tokens to be migrated already deployed.  
    function getTokenNumber() public view returns (uint) {
        return tokenSymbols.length;
    }
}
