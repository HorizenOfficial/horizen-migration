This folder contains the Hardhat scripts for restoring EON and Zend balances.
The script for EON will automatically mint an amount of ZEN ERC-20 tokens equal to the old EON balance for each account.
The script for Zend will just load all balances inside a vault contract. The total balance amount is minted in ZEN ERC-20 token and assigned to the address of the Zend Vault.
Then, each user will have to request an explicit claim for transferring an amount of ZEN ERC-20 tokens equal to their old Zend balance from the Zend Vault account to a destination address of their choice.
After all ZEN tokens corresponding to EON and ZEND balances have been minted, the remaining ZEN supply is automatically minted and assigned to an address owned by the Horizon Foundation and an address owned by the Horizon DAO with the following rules:
- the 25% is readily available after the migration ended
- the 75% will become available after predefined vesting periods, specified in LinearTokenVesting contract.

The scripts use the following contracts:

- ZenToken.sol<br>
The ERC-20 contract

- EONBackupVault.sol<br>
Exposes methods to allow a central authority to load the EON balances to reward and to distribute them.<br>
A cumulative hash of all the addresses + balances is calculated both off chain and onchain, allowing any external user to verify the fairness of the distribution.

- ZendBackupVault.sol<br>
Exposes methods to allow a central authority to load the ZEND balances to reward. Then the user can call the claim function for restoring their balance inside an address of their choice.<br>
A cumulative hash of all the addresses + balances is calculated both off chain and onchain, allowing any external user to verify the fairness of the distribution.

- LinearTokenVesting.sol<br>
The contract implementing the vesting algorithm. There will be 2 instances, one for the supply assigned to the Horizen Foundation and one for Horizen DAO. 

- ZenMigrationFactory.sol<br>
The factory contract for deploying vault, token and vesting contracts.

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
- Deploy on the network the ZenToken and EONBackupVault contracts.  
- Rename .env.template file to .env and update the entries: 
    - NETWORK=\<network name\>, the name of the network to use. 
    - NETWORK_URL=\<network url\>
    - ADMIN_PRIVK=\<private key\> the private key of the account with the authority for restoring the accounts and minting the corresponding ZEN tokens. 
    - TOKEN_ADDRESS=\<address of ZenToken contract\>
    - EON_VAULT_ADDRESS=\<address of EONBackupVault contract\>
    - EON_FILE=\<EON accounts file name\> It is the name and path of the file generated using the script  <i>setup_eon2_json.py</i>
- Calculate the final hash of the EON accounts running the task:
   <i>npx hardhat hashEON</i>
- Update in .env file the entry EON_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreEON</i>

5. To run the Hardhat task for restoring the Zend accounts:<br>
- Deploy on the network the ZendBackupVault contract and ZenToken ERC20 contract, if not deployed yet.  
- Rename .env.template file to .env and update the entries: 
    - NETWORK=\<network name\>, the name of the network to use. 
    - NETWORK_URL=\<network url\>
    - ADMIN_PRIVK=\<private key\> the private key of the account with the authority for restoring the accounts and minting the corresponding ZEN tokens. 
    - ZEND_VAULT_ADDRESS=\<address of ZendBackupVault contract\>
    - TOKEN_ADDRESS=\<address of ZenToken contract\>
    - ZEND_FILE=\<ZEND accounts file name\> It is the name and path of the file generated using the script <i>zend_to_horizen.py</i>
- Calculate the final hash of the ZEND accounts running the task:
   <i>npx hardhat hashZEND</i>
- Update in .env file the entry ZEND_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreZEND</i>
6. For checking that the Horizen Foundation and the Horizen DAO have received the 25% of the remaining ZEN supply:
- In .env file update the entries: 
    - HORIZEN_FOUNDATION=\<address of Horizen Foundation\>. 
    - HORIZEN_DAO=\<address of Horizen DAO\>. 
    - EON_TOTAL_BALANCE=\<Total ZEN balance restored from EON. It can be retrieved as output of restoreEON task\>
    - ZEND_TOTAL_BALANCE=\<Total ZEN balance restored from ZEND. It can be retrieved as output of restoreZEND task\>
-  run <i>npx hardhat finalCheck</i>.
7. For testing the <i>restoreEON</i> and <i>restoreZEND</i> tasks:
 - run <i>npx hardhat node</i>. This command will run a test node, with some predefined accounts.
 - Rename .env.template file to .env and update the entries: 
    - NETWORK=horizenl3. 
    - NETWORK_URL=http://127.0.0.1:8545
    - ADMIN_PRIVK=\<private key\> private key of one of the predefined accounts
    - EON_FILE=\<EON accounts file name\>
    - ZEND_FILE=\<ZEND accounts file name\>
    - HORIZEN_FOUNDATION=\<address of Horizen Foundation\>. 
    - HORIZEN_DAO=\<address of Horizen DAO\>. 
 - run <i>npx hardhat contractSetup</i>. This will deploy the needed contracts. 
 - Set the contract addresses in .env file:
    - TOKEN_ADDRESS=\<address of ZenToken contract\>
    - EON_VAULT_ADDRESS=\<address of EONBackupVault contract\>
    - ZEND_VAULT_ADDRESS=\<address of ZendBackupVault contract\>
- Calculate the final hash of the EON accounts running the task:
   <i>npx hardhat hashEON</i>
- Update in .env file the entry EON_HASH with the hash calculated in the previous step.
- Calculate the final hash of the ZEND accounts running the task:
   <i>npx hardhat hashZEND</i>
- Update in .env file the entry ZEND_HASH with the hash calculated in the previous step.
- Run <i>npx hardhat restoreEON</i>
- Run <i>npx hardhat restoreZEND</i>

