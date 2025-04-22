// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import "./ZenToken.sol";
import "./EONBackupVault.sol";
import "./ZendBackupVault.sol";
import "./LinearTokenVesting.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZenMigrationFactory
/// @notice  This is a factory contract responsible for deploying the 3 contracts used for ZEN migration.
contract ZenMigrationFactory is Ownable {

    ZenToken public token;

    EONBackupVault public eonVault;
    ZendBackupVault public zendVault;
    LinearTokenVesting public horizenFoundationVestingContract;
    LinearTokenVesting public horizenDaoVestingContract;

    uint256 internal constant  VESTING_TIME_BETWEEN_INTERVALS = 30 * 24 * 60 * 60 * 1000; //Length in milliseconds of each vesting interval (30 days)
    uint256 internal constant  VESTING_INTERVALS = 48; //Total number of vesting intervals

    error TokenAlreadyExists();

    event ZenMigrationContractsCreated(address token, address eonVault, address zendVault, address horizenFoundationVestingContract, address horizenDaoVestingContract);

    /// @notice Smart contract constructor
    /// @param _admin The only entity authorized to deploy migration contracts and the future owner of the contracts themselves
    constructor(address _admin) Ownable(_admin) {}

    /// @notice Deploys the migration contracts and the ERC20 token contract.
    /// @param tokenName Name of the token
    /// @param tokenSymbol Token ticker
    /// @param base_claim_message One of the parts of the message to sign for zen claim
    /// @param horizenFoundation Address who will receive the remaining portion of Zen reserved to the Foundation 
    /// @param horizenDao Address who will receive the remaining portion of Zen reserved to the DAO 
    function deployMigrationContracts(
        string memory tokenName,
        string memory tokenSymbol,
        string memory base_claim_message,
        address horizenFoundation,
        address horizenDao

    ) public onlyOwner {
        if (address(token) != address(0)) {
            revert TokenAlreadyExists();
        }

        eonVault = new EONBackupVault(address(this));
        zendVault = new ZendBackupVault(address(this), base_claim_message);

        horizenFoundationVestingContract = new LinearTokenVesting(address(this), horizenFoundation, VESTING_TIME_BETWEEN_INTERVALS, VESTING_INTERVALS);
        horizenDaoVestingContract = new LinearTokenVesting(address(this), horizenDao, VESTING_TIME_BETWEEN_INTERVALS, VESTING_INTERVALS);

        token = new ZenToken(
            tokenName,
            tokenSymbol,
            address(eonVault),
            address(zendVault),
            horizenFoundation,
            address(horizenFoundationVestingContract),
            horizenDao,
            address(horizenDaoVestingContract)
        );

        eonVault.setERC20(address(token));
        zendVault.setERC20(address(token));
        horizenFoundationVestingContract.setERC20(address(token));
        horizenDaoVestingContract.setERC20(address(token));

        eonVault.transferOwnership(owner());
        zendVault.transferOwnership(owner());
        horizenFoundationVestingContract.transferOwnership((owner()));
        horizenDaoVestingContract.transferOwnership((owner()));

       emit ZenMigrationContractsCreated(address(token), address(eonVault), address(zendVault), address(horizenFoundationVestingContract), address(horizenDaoVestingContract));
    }

}
