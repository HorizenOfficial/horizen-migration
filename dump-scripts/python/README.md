This folder contains the scripts used for restoring EON accounts and migrating Zend balances inside the Horizen state.

The data from EON are:
- the account data, dumped with "zen_dump" rpc command
- the list of delegators with the amount of their stakes, retrieved using `get_all_forger_stakes.py` script.
The stake amounts are added to the delegator account balance.

These accounts will be directly restored in the Zen ERC20 smart contract, with the same balances they had in EON, using the EonBackupVault smart contract.

The data from Zend are a list of Zend addresses with their balance.
These accounts cannot be directly restored in the Zen ERC20 smart contract, because the destination address cannot be automatically determined. 
So the owners of these accounts that want to import their balances in Horizen 2 will need to execute a claim procedure, specifying
a Horizen account where their funds will be sent. This claim procedure will be executed using ZenBackupVault smart contract.

**Note:** There can be cases where some Zend accounts cannot be restored using the claim procedure. In that case, 
the Ethereum address where their funds will be restored will be provided directly off-chain by the owners, using a json file 
where the Zend accounts are mapped to Ethereum addresses. These accounts will then be restored using the EonBackupVault smart contract, as if they were Eon Accounts.

# Module installation:
- Execute this command from this folder: 

```sh
pip install -e .
```

(For more recents Ubuntu versions you may be forced to activate an environment first, for example with: )

```sh
python3 -m venv .venv
source  .venv/bin/activate
```


# Workflow
The workflow should be:
1. Execute the dump on Zend using `dumper` application. 
2. Convert the Zend dump using `zend_to_horizen` script, eventually together with the Zend - Ethereum addresses mapping file, 
and then retrieve the output files, one for the addresses to be restored using ZenBackupVault smart contract and one for EonBackupVault smart contract.  (e.g. zend_vault_accounts.json and eon_vault_accounts.json).
3. Call zen_dump rpc method on EON at a certain block height and retrieve the resulting file (e.g. eon_dump.json).
4. Execute `get_all_forger_stakes` script at the same block height used with zen_dump rpc and retrieve the resulting file (e.g. eon_stakes.json).
5. Execute `setup_eon2_json` script using as input the eon dump file, the eon stakes file and the file with the zend accounts mapped to Ethereum addresses.

# Migration Scripts

## get_all_forger_stakes.py

This script retrieves from EON the list of delegators with the amount of their stakes at a specific
block height. 

Usage:

```sh
$ get_all_forger_stakes <block height> <rpc url> <output_file>
```

* `<block height>` block height used for the dump.
* `<rpc url>` Rpc url to use, like "https://eon-rpc.horizenlabs.io/ethv1"
* `<output_file>` is the path of the output.

The output is a json file with a list of "account": "amount" items.

## zend_to_horizen.py
This script takes as input:
- a csv file containing a list of all the Zend addresses with their balance in satoshis, created by the `dumper` application
- (Optional) a json file with a list of Zend addresses and their corresponding Ethereum addresses.

It creates as output:
- a json file with the Base58 decoded zend address and the balance in wei. These addresses will be restored by the ZendBackupVault contract.
- a json file with the Ethereum addresses defined in the mapping file with the balance in wei of their corresponding Zend addresses. These addresses will be restored by the EonBackupVault contract.

Usage:

```sh
$ zend_to_horizen <zend csv dump file> <json mapping file> <zend_vault_file> <eon_vault_file>
```

The output is:
- a json file with a list of `"decoded address":"balance"` items, alphabetically ordered (<zend_vault_file>).
- a json file with a list of `"Ethereum address":"balance"` items, alphabetically ordered (<eon_vault_file>).

## setup_eon2_json.py

This script transforms the account data dumped from Eon in the format requested for the migration
to Horizen 2.0.
Usage:

```sh
$ setup_eon2_json <eon dump file> <eon stake file> <eon_vault_file> <output_file>
```

* `<eon dump file>` is the json file created calling zen_dump rpc method on EON.
* `<eon stake file>` is the json file created calling `get_all_forger_stakes.py` script.
* `<eon_vault_file>` is the json file created calling `zend_to_horizen.py` script with a mapping file.
* `<output_file>` is the path of the output.

The script creates, as output, a json file in plain format, with a list of `"address":"balance"` items, 
alphabetically ordered. Only the amounts belonging to EOA accounts are included in the file.
