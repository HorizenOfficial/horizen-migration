// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IZenToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function notifyMintingDone() external;
    function symbol() external view returns(string memory);
}