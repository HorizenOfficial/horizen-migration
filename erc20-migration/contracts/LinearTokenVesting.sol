// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
    error AddressNotValid();
    error TokenAndBeneficiaryCantBeTheSame();
    error AmountCantBeZero();
    error InvalidTimes();
    error NothingToClaim();
    error ClaimCompleted();
    error UnauthorizedOperation();
    error ERC20NotSet();
    error VestingNotStartedYet();

    constructor(address _admin, address _beneficiary, uint256 _timeBetweenClaims, uint256 _intervalsToClaim) Ownable(_admin){
        if(_admin == address(0) || _beneficiary == address(0)) revert AddressParameterCantBeZero();
        if(_timeBetweenClaims == 0) revert InvalidTimes();       
        beneficiary = _beneficiary;
        timeBetweenClaims = _timeBetweenClaims;
        intervalsToClaim = _intervalsToClaim;
    }

    /// @notice Set official ZEN ERC-20 smart contract that will be used for initial transfer and start vesting
    function setERC20(address addr) public onlyOwner {
        if (address(token) != address(0)) revert UnauthorizedOperation();  //ERC-20 address already set
        if(addr == address(0)) revert AddressNotValid();
        if(addr == beneficiary) revert TokenAndBeneficiaryCantBeTheSame();
        token = ERC20(addr);
    }

    function startVesting() public {
        if (msg.sender != address(token)) revert UnauthorizedOperation(); 
        if (amountForEachClaim != 0 || startTimestamp != 0) revert UnauthorizedOperation(); //already called
        uint256 totalToVest = token.balanceOf(address(this));
        if (totalToVest == 0) revert AmountCantBeZero();
        amountForEachClaim = totalToVest / intervalsToClaim;
        startTimestamp = block.timestamp;
    } 

    function claim() public {
        if (address(token) == address(0)) revert ERC20NotSet();
        if (startTimestamp == 0) revert VestingNotStartedYet();
        if(intervalsAlreadyClaimed == intervalsToClaim) revert ClaimCompleted();

        uint256 periodsPassed = (block.timestamp - (startTimestamp + timeBetweenClaims * intervalsAlreadyClaimed)) / timeBetweenClaims;
        if(periodsPassed == 0) revert NothingToClaim();

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