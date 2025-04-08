// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IERC20Mintable.sol";
import "./EONBackupVault.sol";
import "./ZendBackupVault.sol";
import "./ZenToken.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZenMigrationFactory
/// @notice  This is a factory contract responsible for deploying the 3 contracts used for the migration. 
contract ZenMigrationFactory is Ownable {

    struct MigrationContracts {
        IERC20Mintable token;
        EONBackupVault eonVault;
        ZendBackupVault zendVault;
    }

    mapping(string => MigrationContracts) public migrationContracts;
    string[] public tokenNames;

    error TokenAlreadyExists(string tokenName);

    /// @notice Smart contract constructor
    /// @param _admin The only entity authorized to perform restore operations
    constructor(address _admin) Ownable(_admin) {}


    /// @notice Deploys the migration contracts and the ERC20 contract related to a specific token.  
    /// @param tokenName Name of the token
    /// @param tokenSymbol Token ticker
    function deployMigrationContracts(
        string memory tokenName,
        string memory tokenSymbol
    ) public onlyOwner {
        if (address(migrationContracts[tokenName].token) != address(0)) {
            revert TokenAlreadyExists(tokenName);
        }

        tokenNames.push(tokenName);

        EONBackupVault eonVault = new EONBackupVault(address(this));
        ZendBackupVault zendVault = new ZendBackupVault(address(this));
        ZenToken token = new ZenToken(
            tokenName,
            tokenSymbol,
            address(eonVault),
            address(zendVault)
        );

        migrationContracts[tokenName] = MigrationContracts(
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
        return tokenNames.length;
    }
}
