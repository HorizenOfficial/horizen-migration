Execute run.sh  to transform the ZEND and EON dumps in a format used in the migration process. <br/>

<br/><br/>

Usage: run.sh <network> <zend_dump> <eon_dump> <eon_stakes> <output_folder><br/>
  <network> Network used for the input data (mainnet or testnet) <br/>
  <zend_dump> Path to Zend dump, obtained with zend dumper command<br/>
  <eon_dump> Path to EON dump, obtained with zen_dump rpc method on EON<br/>
  <eon_stakes> Path to EON stakes dump, obtained with pyhton script [/python/get_all_forger_stakes.py](https://github.com/HorizenOfficial/horizen-migration/blob/pc/migration_bash/dump-scripts/python/get_all_forger_stakes.py)<br/>
  <output_folder> Output folder of the final artifacts<br/>
  