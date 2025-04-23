// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LinearTokenVesting
/// @notice This contract implements the vesting strategy for the remaining ZEN supply.  
contract LinearTokenVesting  is Ownable {

    ERC20 public token;
    address public immutable beneficiary;

    uint256 public amountForEachClaim;
    uint256 public startTimestamp;
    uint256 public immutable timeBetweenClaims; 
    uint256 public immutable intervalsToClaim;
    uint256 public intervalsAlreadyClaimed;

    event Claimed(uint256 claimAmount, uint256 timestamp);

    error AddressParameterCantBeZero();
    error TokenAndBeneficiaryCantBeTheSame();
    error AmountCantBeZero();
    error InvalidTimes();
    error NothingToClaim();
    error ClaimCompleted();
    error UnauthorizedOperation();
    error ERC20NotSet();
    error VestingNotStartedYet();
    error VestingAlreadyStarted();

    /// @notice Smart contract constructor
    /// @param _beneficiary the account that will receive the vested zen
    /// @param _timeBetweenClaims The minimum time in seconds that must be waited between claims
    /// @param _intervalsToClaim The number of vesting periods 
    constructor(address _beneficiary, uint256 _timeBetweenClaims, uint256 _intervalsToClaim) Ownable(msg.sender){
        if(_beneficiary == address(0)) revert AddressParameterCantBeZero();
        if(_timeBetweenClaims == 0) revert InvalidTimes();       
        beneficiary = _beneficiary;
        timeBetweenClaims = _timeBetweenClaims;
        intervalsToClaim = _intervalsToClaim;
    }

    /// @notice Set official ZEN ERC-20 smart contract that will be used for initial transfer and start vesting
    /// @param addr Address of the ERC20
    function setERC20(address addr) public onlyOwner {
        if (address(token) != address(0)) revert UnauthorizedOperation();  //ERC-20 address already set
        if(addr == address(0)) revert AddressParameterCantBeZero();
        if(addr == beneficiary) revert TokenAndBeneficiaryCantBeTheSame();
        token = ERC20(addr);
    }

    /// @notice This function is called by the ERC20 when minting has ended, to notify that the vesting period can start.
    function startVesting() public {
        if (msg.sender != address(token)) revert UnauthorizedOperation(); 
        if (amountForEachClaim != 0 || startTimestamp != 0) revert VestingAlreadyStarted(); //already called

        uint256 totalToVest = token.balanceOf(address(this));
        if (totalToVest == 0) revert AmountCantBeZero();
        amountForEachClaim = totalToVest / intervalsToClaim;
        startTimestamp = block.timestamp;
    } 

    /// @notice This function is called for transfer to beneficiary the amount that was accrued from the last claim. If it is called before at least one interval has passed, the claim fails. 
    ///         If more than one period have passed, the sum of amounts of the passed periods is transferred. 
    function claim() public {
        if (address(token) == address(0)) revert ERC20NotSet();
        if (startTimestamp == 0) revert VestingNotStartedYet();
        if (intervalsAlreadyClaimed == intervalsToClaim) revert ClaimCompleted();

        uint256 periodsPassed = (block.timestamp - (startTimestamp + timeBetweenClaims * intervalsAlreadyClaimed)) / timeBetweenClaims;
        if (periodsPassed == 0) revert NothingToClaim();

        uint256 intervalsToClaimNow = _min(intervalsToClaim - intervalsAlreadyClaimed, periodsPassed); 
        intervalsAlreadyClaimed += intervalsToClaimNow;       
        uint256 amountToClaimNow;
        if (intervalsAlreadyClaimed < intervalsToClaim) {
            amountToClaimNow = intervalsToClaimNow * amountForEachClaim;
        }
        else {
            amountToClaimNow = token.balanceOf(address(this));
        }

        emit Claimed(amountToClaimNow, block.timestamp);

        token.transfer(beneficiary, amountToClaimNow);
    }

    function _min(uint256 a, uint256 b) internal pure returns(uint256) {
        return a < b? a : b;
    }
}