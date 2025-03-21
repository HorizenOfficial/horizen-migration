This folder contains the scripts used for restoring EON accounts and migrating Zend balances inside the Horizen state.

The data from EON are:
- the account data, dumped with "zen_dump" rpc command
- the list of delegators with the amount of their stakes, retrieved using get_all_forger_stakes.py script.
The stake amounts are added to the delegator account balance.

The data from Zend are a list of Zend addresses with their balance.   
**Note:** these addresses are meant to be used and controlled only by the zen claim procedure. Zend users that want to import their balances in Horizen can not
use these accounts directly, they will need instead to execute the claim procedure and then their coins will be transferred
to a Horizen account under their control.

# Workflow
The workflow should be:
1. Call zen_dump rpc method on EON at a certain block height and retrieve the resulting file (e.g. eon_dump.json)
2. Execute get_all_forger_stakes.py script at the same block height used with zen_dump rpc and retrieve the resulting file (e.g. eon_stakes.json)
3. Execute the dump on Zend (**TBD**). Convert the Zend dump using zend_to_horizen.py and retrieve the resulting file (e.g. horizen_mapped_zend_dump.csv)

# Migration Scripts

## get_all_forger_stakes.py

This script retrieves from EON the list of delegators with the amount of their stakes at a specific
block height. 

Usage:

```sh
$ python3 get_all_forger_stakes.py <block height> <rpc url> <output_file>
```

* `<block height>` block height used for the dump.
* `<rpc url>` Rpc url to use, like "https://eon-rpc.horizenlabs.io/ethv1"
* `<output_file>` is the path of the output.

The output is a json file with a list of "account": "amount" items.

## zend_to_horizen.py
This script takes as input a csv file containing a list with the Zend addresses and their balance in satoshis and
creates, as output, a json file with the Base58 decoded zend address and the balance in wei.

Usage:

```sh
$ python3 zend_to_horizen.py <zend csv dump file> <output_file>
```

The output is a json file with a list of `"decoded address":"balance"` items.


## setup_eon2_json.py

This script transforms the account data dumped from Eon in the format requested for the migration
to Horizen 2.0.
Usage:

```sh
$ python3 setup_eon2_json.py <eon dump file> <eon stake file> <output_file>
```

* `<eon dump file>` is the json file created calling zen_dump rpc method on EON.
* `<eon stake file>` is the json file created calling get_all_forger_stakes.py script.
* `<output_file>` is the path of the output.

The script creates, as output, a json file in plain format.
