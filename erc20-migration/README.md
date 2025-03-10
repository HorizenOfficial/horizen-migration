This folder contains an Hardhat Proof of concept for a ZEN ERC-20 token, with balances restored from an external dump.

It is composed by two main contracts:

- ZTEST.sol<br>
The ERC-20 contract

- ZTESTBackupVault.sol<br>
Exposes methods to allow a central authority to load the balances to reward, and then proceed to distribute them.<br>
A cumulative hash of all the address+balances is calculated both offchain and onchain, allowing any external user to verify the fairness of the distribution.

Usage:

1. Install dependencies:<br>
<i>npm install</i>

2. Run locally the full test suite, that simulates the whole flow:<br>
<i>npx hardhat test</i>

3. (Optionally) If you want to run the suite in real network:
- create a .env file in the root folder with an entry: MNEMONIC=<seed_phrase> , with the seedphrase of a metamask wallet with funds
- configure in hardhat-config.js the desired network and change the value of defaultNetwork property to use it
- rerun point 2.