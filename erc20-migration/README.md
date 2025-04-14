This folder contains the Hardhat scripts for restoring EON and Zend balances.
The script for EON will automatically mint an amount of ZEN ERC-20 tokens equal to the old EON balance for each account.
The script for Zend will just load all balances inside a vault contract. Then, each user will have to request an explicit claim for minting an amount of ZEN ERC-20 tokens equal to their old Zend balance.

The scripts use the following contracts:

- ZTEST.sol<br>
The ERC-20 contract

- ZTESTBackupVault.sol<br>
Exposes methods to allow a central authority to load the EON balances to reward and to distribute them.<br>
A cumulative hash of all the addresses + balances is calculated both off chain and onchain, allowing any external user to verify the fairness of the distribution.

- ZTESTZendBackupVault.sol<br>
Exposes methods to allow a central authority to load the ZEND balances to reward. Then the user can call the claim function for restoring their balance inside an address of their choice.<br>
A cumulative hash of all the addresses + balances is calculated both off chain and onchain, allowing any external user to verify the fairness of the distribution.

Usage:

1. Install dependencies:<br>
<i>npm install</i>

2. To run locally the full test suite, that simulates the whole flow:<br>
- <i>npx hardhat test</i>

3. (Optionally) If you want to run the test suite in real network:
- Copy .env.test file as .env: <i>cp .env.test .env</i>
- Update the following entries: 
   - NETWORK=test
   - MNEMONIC=<seed_phrase>, with the seed phrase of a metamask wallet with funds
   - NETWORK_URL=\<network url\>
- Run <i>npx hardhat test</i>.

4. To run the Hardhat task for restoring the EON accounts:<br>
- Deploy on the network the ZTEST and ZTESTBackupVault contracts.  
- Rename .env.template file to .env and update the entries: 
    - NETWORK=\<network name\>, the name of the network to use. 
    - NETWORK_URL=\<network url\>
    - ADMIN_PRIVK=\<private key\> the private key of the account with the authority for restoring the accounts and minting the corresponding ZEN tokens. 
    - TOKEN_ADDRESS=\<address of ZTEST contract\>
    - EON_VAULT_ADDRESS=\<address of ZTESTBackupVault contract\>
    - EON_FILE=\<EON accounts file name\> It is the name and path of the file generated using the script  <i>setup_eon2_json.py</i>
- Calculate the final hash of the EON accounts running the task:
   <i>npx hardhat hashEON</i>
- Update in .env file the entry EON_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreEON</i>

5. To run the Hardhat task for restoring the Zend accounts:<br>
- Deploy on the network the ZTESTZendBackupVault contract and ZTEST ERC20 contract, if not deployed yet.  
- Rename .env.template file to .env and update the entries: 
    - NETWORK=\<network name\>, the name of the network to use. 
    - NETWORK_URL=\<network url\>
    - ADMIN_PRIVK=\<private key\> the private key of the account with the authority for restoring the accounts and minting the corresponding ZEN tokens. 
    - ZEND_VAULT_ADDRESS=\<address of ZTESTZendBackupVault contract\>
    - TOKEN_ADDRESS=\<address of ZTEST contract\>
    - ZEND_FILE=\<ZEND accounts file name\> It is the name and path of the file generated using the script <i>zend_to_horizen.py</i>
- Calculate the final hash of the ZEND accounts running the task:
   <i>npx hardhat hashZEND</i>
- Update in .env file the entry ZEND_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreZEND</i>

6. For testing the <i>restoreEON</i> and <i>npx hardhat restoreZEND</i> tasks:
 - run <i>npx hardhat node</i>. This command will run a test node, with some predefined accounts.
 - Rename .env.template file to .env and update the entries: 
    - NETWORK=horizenl3. 
    - NETWORK_URL=http://127.0.0.1:8545
    - ADMIN_PRIVK=\<private key\> private key of one of the predefined accounts
    - EON_FILE=\<EON accounts file name\>
    - ZEND_FILE=\<ZEND accounts file name\>
 - run <i>npx hardhat contractSetup</i>. This will deploy the needed contracts. 
 - Set the contract addresses in .env file:
    - TOKEN_ADDRESS=\<address of ZTEST contract\>
    - EON_VAULT_ADDRESS=\<address of ZTESTBackupVault contract\>
    - ZEND_VAULT_ADDRESS=\<address of ZTESTZendBackupVault contract\>
- Calculate the final hash of the EON accounts running the task:
   <i>npx hardhat hashEON</i>
- Update in .env file the entry EON_HASH with the hash calculated in the previous step.
- Calculate the final hash of the ZEND accounts running the task:
   <i>npx hardhat hashZEND</i>
- Update in .env file the entry ZEND_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreEON</i>
- Run <i>npx hardhat restoreZEND</i>

