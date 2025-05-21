Execute **run.sh**  to transform the ZEND and EON dumps in a format used in the migration process. <br/>

### Prerequisites:
- Python installed
- install horizen_dump_scripts module:

```sh
cd python/horizen_dump_scripts
pip install -e .
```

(For more recents Ubuntu versions you may be forced to activate an environment first, for example with: )

```sh
python3 -m venv .venv
source  .venv/bin/activate
```

### Usage:

```sh
run.sh <network_type> <zend_dump> <eon_dump> <eon_stakes> <output_folder>
```

  * `<network_type>`: Network used for the input data (mainnet or testnet) <br/>
  * `<zend_dump>`: Path to Zend dump, obtained with zend dumper command<br/>
  * `<eon_dump>`: Path to EON dump, obtained with zen_dump rpc method on EON<br/>
  * `<eon_stakes>`: Path to EON stakes dump, obtained with pyhton command [get_all_forger_stakes](https://github.com/HorizenOfficial/horizen-migration/blob/pc/migration_bash/dump-scripts/python/horizen_dump_scripts/get_all_forger_stakes.py) (included in the python horizen_dump_scripts module)<br/>
  * `<output_folder>`: Output folder of the final artifacts<br/>




If you want to execute manually step-by-step, follow the detailed description [here](https://github.com/HorizenOfficial/horizen-migration/tree/pc/migration_bash/dump-scripts/python/README.md) .

### Next steps:

Go to the [horizen-migration-check](https://github.com/HorizenOfficial/horizen-migration-check) project and use the produced artifacts to check the migration correctness.
