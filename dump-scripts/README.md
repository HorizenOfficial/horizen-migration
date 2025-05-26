Execute **create_restore_artifacts.sh**  to transform the ZEND and EON dumps in a format used in the migration process. <br/>

### Prerequisites:
- Python installed
- Zend and EON network dumps - refer to [this howto](https://horizen-2-docs.horizen.io/migration/dump-execution) for help 
- install horizen_dump_scripts module:

```sh
cd python
python -m pip install --require-hashes -r requirements.txt
python -m pip install -e .
```

  (For more recent Ubuntu versions you may be forced to activate an environment first, in this case you can follow these steps: )

  1. Install the Ubuntu package python3-venv:

  ```sh
  sudo apt update && sudo apt install python3-venv
  ```
  2. Activate the environment

  ```sh
  python3 -m venv .venv
  source  .venv/bin/activate
  ```

  3. When completed, in order to exit from the .venv type: deactivate


### Usage:

```sh
create_restore_artifacts.sh <network_type> <zend_dump> <eon_dump> <eon_height> <output_folder> [<eon_rpc_url>]
```

  * `<network_type>`: Network used for the input data (mainnet or testnet) <br/>
  * `<zend_dump>`: Path to Zend dump, obtained with zend dumper command<br/>
  * `<eon_dump>`: Path to EON dump, obtained with zen_dump rpc method on EON<br/>
  * `<eon_height>`: Height of the EON dump<br/>
  * `<output_folder>`: Output folder of the final artifacts<br/>
  * `<eon_rpc_url>`: (Optional) EON rpc url. If not specified - the official rpc urls will be used, based on *network_type* parameter<br/>


Note: If you want to execute manually the process step-by-step, follow the detailed description [here](https://github.com/HorizenOfficial/horizen-migration/blob/main/dump-scripts/python/README.md) .

### Next steps:

Go to the [horizen-migration-check](https://github.com/HorizenOfficial/horizen-migration-check) project and use the produced artifacts to check the migration correctness.
