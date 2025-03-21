import json
import sys
import csv

import base58

"""
This python script will require the following input parameters:
- zend dump csv file created from zend dump script
- zend list for horizen 2 file created with horizen 2 zend_to_horizen.py script

It will compare addresses and balances between these 2 files.
If something goes wrong (balances don't match or an address is missing) it will be printed in terminal.
At the end of the execution a message will confirm if the global check was successful or not.
"""

SATOSHI_TO_WEI_MULTIPLIER = 10 ** 10

# Global variable to keep track of failed checks
failed_zend_check = False
def set_failed_execution():
    global failed_zend_check
    failed_zend_check = True

def satoshi_2_wei(value_in_satoshi):
    return int(round(SATOSHI_TO_WEI_MULTIPLIER * value_in_satoshi))

def validate_zend_data(zend_dump_file_name, horizen2_zend_file_name):
    with open(zend_dump_file_name, 'r') as zend_dump_file, open(horizen2_zend_file_name, 'r') as horizen2_zend_file:
        zend_dump_reader = csv.reader(zend_dump_file)
        horizen2_zend_data = json.load(horizen2_zend_file)
        
        zend_dump_data = {row[0]: int(row[1]) for row in zend_dump_reader} 

        multiple_addresses_from_same_accounts = {}
        for zend_address, zend_address_balance in zend_dump_data.items():
            decoded_address = base58.b58decode_check(zend_address).hex()[4:]
            if decoded_address in horizen2_zend_data:
                zend_address_balance_wei = satoshi_2_wei(zend_address_balance)
                horizen2_zend_address_balance = horizen2_zend_data[decoded_address]
                if zend_address_balance_wei == horizen2_zend_address_balance:
                    del horizen2_zend_data[decoded_address]
                elif zend_address_balance_wei < horizen2_zend_address_balance:
                    if decoded_address in multiple_addresses_from_same_accounts:
                        multiple_addresses_from_same_accounts[decoded_address] = multiple_addresses_from_same_accounts[decoded_address] + zend_address_balance_wei
                    else:
                        multiple_addresses_from_same_accounts[decoded_address] = zend_address_balance_wei
                else:
                    set_failed_execution()
                    del horizen2_zend_data[decoded_address]
                    print(f"Zend address {zend_address} - decoded {decoded_address}  balances do not match. Horizen2 data: {horizen2_zend_address_balance} wei. Zend dump: {zend_address_balance_wei} wei.")
            else:
                set_failed_execution()
                print(f"Zend address {zend_address} - decoded {decoded_address} present in Zend dump file {zend_dump_file_name}"
                      f" but not found in Horizen 2 from Zend file {horizen2_zend_file_name}.")

        for zend_address, zend_address_balance in multiple_addresses_from_same_accounts.items():
            if zend_address_balance != horizen2_zend_data[zend_address]:
               set_failed_execution()
               print(
                    f"Decoded zend address {zend_address}  balances do not match. Horizen2 data: {horizen2_zend_data[zend_address]} wei. Zend dump: {zend_address_balance} wei.")
            del horizen2_zend_data[zend_address]

        # Here the only addresses left are not present in zend csv file
        for horizen2_zend_address, _ in horizen2_zend_data.items():
            set_failed_execution()
            print(f"Zend address {horizen2_zend_address} present in Horizen 2 from Zend file {horizen2_zend_file_name} not found in Zend dump file {zend_dump_file_name}.")
        

# Input files
zend_dump_file_name = sys.argv[1]
horizen2_zend_file_name = sys.argv[2]

# Run the data validation
validate_zend_data(zend_dump_file_name, horizen2_zend_file_name)

if failed_zend_check:
    print("Horizen 2 Zend address and balance check failed.")
    sys.exit(1)
else:
    print("Horizen 2 Zend address and balance check successful.")