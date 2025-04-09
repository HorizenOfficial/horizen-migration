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

    error NothingToClaim();
    error ClaimCompleted();

    constructor(address _token, address _beneficiary, uint256 _amountForEachClaim, uint256 _startTimestamp, uint256 _timeBetweenClaims, uint256 _intervalsToClaim) {
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