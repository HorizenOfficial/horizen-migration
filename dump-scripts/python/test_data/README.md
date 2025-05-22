This folder contains files for testing the migration scripts.
zend_dump.csv contains the zend dump with the following special cases:
- unknown address
- 2 addresses with 0 balance
- 2 couples of addresses from the same hash


mapping.json contains the zend addresses directly mapped on an Ethereum address. It contains the following special cases:
- 1 address included in zend_dump.csv file with 0 balance
- 1 address not included in zend_dump.csv file
- 1 address that is from the same hash of an address not mapped
- 2 different addresses that are mapped on the same Ethereum address

Running zend_to_horizen.py using these files should print the following warning (not necessarily in this order):
- 1 warning for the unknown address
- 2 warnings for address with 0 balance
- 1 warning for 2 addresses from the same hash
- 1 warning saying that 2 mapped addresses have no balance
