// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LinearTokenVesting {

    address immutable token;
    address immutable beneficiary;
    uint256 immutable amountForEachClaim;
    uint256 immutable timeBetweenClaims; 
    uint256 immutable intervalsToClaim;

    uint256 lastClaimedIntervalTimestamp;
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

        lastClaimedIntervalTimestamp = _startTimestamp;
    }

    function claim() public {
        if(intervalsAlreadyClaimed == intervalsToClaim) revert ClaimCompleted();
        if(block.timestamp - lastClaimedIntervalTimestamp < timeBetweenClaims) revert NothingToClaim();

        uint256 tempTimestamp = lastClaimedIntervalTimestamp;
        uint256 tempInterval = intervalsAlreadyClaimed;
        uint256 amountToClaimNow; // = 0

        while (tempTimestamp + timeBetweenClaims <= block.timestamp && tempInterval < intervalsToClaim) {
            amountToClaimNow += amountForEachClaim;
            tempTimestamp += timeBetweenClaims;
            ++tempInterval;
        }

        lastClaimedIntervalTimestamp = tempTimestamp;
        intervalsAlreadyClaimed = tempInterval;

        emit Claimed(amountToClaimNow, block.timestamp);
        ERC20(token).transfer(beneficiary, amountToClaimNow);
    }
}