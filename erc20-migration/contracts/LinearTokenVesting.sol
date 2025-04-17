// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LinearTokenVesting {

    address immutable token;
    address immutable beneficiary;
    uint256 immutable amountForEachClaim;
    uint256 immutable startTimestamp;
    uint256 immutable timeBetweenClaims; 
    uint256 immutable intervalsToClaim;
    uint256 intervalsAlreadyClaimed;

    event Claimed(uint256 claimAmount, uint256 timestamp);

    error AddressParameterCantBeZero();
    error TokenAndBeneficiaryCantBeTheSame();
    error AmountCantBeZero();
    error InvalidTimes();
    error NothingToClaim();
    error ClaimCompleted();

    constructor(address _token, address _beneficiary, uint256 _amountForEachClaim, uint256 _startTimestamp, uint256 _timeBetweenClaims, uint256 _intervalsToClaim) {
        if(_token == address(0) || _beneficiary == address(0)) revert AddressParameterCantBeZero();
        if(_token == _beneficiary) revert TokenAndBeneficiaryCantBeTheSame();
        if(_timeBetweenClaims == 0 || _startTimestamp < block.timestamp) revert InvalidTimes();
        if(_amountForEachClaim == 0) revert AmountCantBeZero();
        
        token = _token;
        beneficiary = _beneficiary;
        amountForEachClaim = _amountForEachClaim;
        timeBetweenClaims = _timeBetweenClaims;
        intervalsToClaim = _intervalsToClaim;

        startTimestamp = _startTimestamp;
    }

    function claim() public {
        if(intervalsAlreadyClaimed == intervalsToClaim) revert ClaimCompleted();

        uint256 periodsPassed = (block.timestamp - (startTimestamp + timeBetweenClaims * intervalsAlreadyClaimed)) / timeBetweenClaims;
        if(periodsPassed == 0) revert NothingToClaim();

        uint256 intervalsToClaimNow = _min(intervalsToClaim - intervalsAlreadyClaimed, periodsPassed); 
        uint256 amountToClaimNow = intervalsToClaimNow * amountForEachClaim;

        emit Claimed(amountToClaimNow, block.timestamp);
        intervalsAlreadyClaimed += intervalsToClaimNow;
        ERC20(token).transfer(beneficiary, amountToClaimNow);
    }

    function _min(uint256 a, uint256 b) internal pure returns(uint256) {
        return a < b? a : b;
    }
}