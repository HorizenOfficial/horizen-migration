// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import "./ZenToken.sol";
import "./EONBackupVault.sol";
import "./ZendBackupVault.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZenMigrationFactory
/// @notice  This is a factory contract responsible for deploying the 3 contracts used for ZEN migration.
contract ZenMigrationFactory is Ownable {

    ZenToken public token;
    EONBackupVault public eonVault;
    ZendBackupVault public zendVault;

    error TokenAlreadyExists();

    event ZenMigrationContractsCreated(address token, address eonVault, address zendVault);

    /// @notice Smart contract constructor
    /// @param _admin The only entity authorized to deploy migration contracts and the future owner of the contracts themselves
    constructor(address _admin) Ownable(_admin) {}

    /// @notice Deploys the migration contracts and the ERC20 token contract.
    /// @param tokenName Name of the token
    /// @param tokenSymbol Token ticker
    /// @param base_claim_message One of the parts of the message to sign for zen claim
    /// @param horizenFoundation Address who will receive the remaining Zen supply
    function deployMigrationContracts(
        string memory tokenName,
        string memory tokenSymbol,
        string memory base_claim_message,
        address horizenFoundation
    ) public onlyOwner {
        if (address(token) != address(0)) {
            revert TokenAlreadyExists();
        }

        eonVault = new EONBackupVault(address(this));
        zendVault = new ZendBackupVault(address(this), base_claim_message);
        token = new ZenToken(
            tokenName,
            tokenSymbol,
            address(eonVault),
            address(zendVault),
            horizenFoundation
        );

        eonVault.setERC20(address(token));
        zendVault.setERC20(address(token));

        eonVault.transferOwnership(owner());
        zendVault.transferOwnership(owner());

       emit ZenMigrationContractsCreated(address(token), address(eonVault), address(zendVault));
    }

}
