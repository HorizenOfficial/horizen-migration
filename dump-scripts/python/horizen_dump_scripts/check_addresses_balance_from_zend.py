import collections
import json
import sys
import csv
import os
import base58

"""
This python script will require the following input parameters:
- zend dump csv file created from zend dump script
- zend accounts list for Horizen 2 file, created with Horizen 2 zend_to_horizen.py script

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
    return SATOSHI_TO_WEI_MULTIPLIER * value_in_satoshi

def validate_zend_data(zend_dump_file_name, zend_vault_file_name, mapping_file_name=None, eon_vault_file_name=None):
    with open(zend_dump_file_name, 'r') as zend_dump_file, open(zend_vault_file_name, 'r') as zend_vault_file:
        zend_dump_reader = csv.reader(zend_dump_file)
        zend_vault_data = json.load(zend_vault_file)
        
        zend_dump_data = {row[0]: int(row[1]) for row in zend_dump_reader} 

        if mapping_file_name is not None and eon_vault_file_name is not None:
            with open(mapping_file_name, 'r') as mapping_file, open(eon_vault_file_name, 'r') as eon_vault_file:
                eon_vault_data = json.load(eon_vault_file)
                mapping_data = json.load(mapping_file)

                resulting_balances = {}
                for zend_address, eth_address in mapping_data.items():
                    if zend_address in zend_dump_data and int(zend_dump_data[zend_address]) != 0:
                        balance_wei = satoshi_2_wei(zend_dump_data[zend_address])
                        eth_address = eth_address.lower()
                        if eth_address in resulting_balances:
                            resulting_balances[eth_address] = resulting_balances[eth_address] + balance_wei
                        else:
                            resulting_balances[eth_address] = balance_wei
                        zend_dump_data.pop(zend_address)

                for eth_address, balance in resulting_balances.items():
                    if eth_address not in eon_vault_data:
                        set_failed_execution()
                        print(
                            f"Ethereum address {eth_address} missing in Eon vault data")
                    else:
                        if balance != eon_vault_data[eth_address]:
                            set_failed_execution()
                            print(
                                f"Ethereum address {eth_address} balances do not match. Eon vault data: {eon_vault_data[eth_address]} wei. Balance from Zend dump: {balance} wei.")
                        eon_vault_data.pop(eth_address)

                # Here the only addresses left are not present in zend csv file or in the mapping file
                for address, _ in eon_vault_data.items():
                    set_failed_execution()
                    print(
                        f"Ethereum address {address} present in Eon vault file {eon_vault_file_name} not found in Zend dump file {zend_dump_file_name} or in the mapping file {mapping_file_name}.")

        multiple_addresses_from_same_accounts = {}
        for zend_address, zend_address_balance in zend_dump_data.items():
            if not zend_address.startswith("unknown") and int(zend_address_balance) != 0:
                decoded_address = "0x" + base58.b58decode_check(zend_address).hex()[4:]
                if decoded_address in zend_vault_data:
                    zend_address_balance_wei = satoshi_2_wei(zend_address_balance)
                    horizen2_zend_address_balance = zend_vault_data[decoded_address]
                    if zend_address_balance_wei == horizen2_zend_address_balance:
                        del zend_vault_data[decoded_address]
                    elif zend_address_balance_wei < horizen2_zend_address_balance:
                        if decoded_address in multiple_addresses_from_same_accounts:
                            multiple_addresses_from_same_accounts[decoded_address] = multiple_addresses_from_same_accounts[decoded_address] + zend_address_balance_wei
                        else:
                            multiple_addresses_from_same_accounts[decoded_address] = zend_address_balance_wei
                    else:
                        set_failed_execution()
                        del zend_vault_data[decoded_address]
                        print(f"Zend address {zend_address} - decoded {decoded_address} balances do not match. Horizen2 data: {horizen2_zend_address_balance} wei. Zend dump: {zend_address_balance_wei} wei.")
                else:
                    set_failed_execution()
                    print(f"Zend address {zend_address} - decoded {decoded_address} present in Zend dump file {zend_dump_file_name}"
                          f" but not found in Horizen 2 from Zend file {zend_vault_file_name}.")

        for zend_address, zend_address_balance in multiple_addresses_from_same_accounts.items():
            if zend_address_balance != zend_vault_data[zend_address]:
               set_failed_execution()
               print(
                    f"Decoded zend address {zend_address} balances do not match. Horizen2 data: {zend_vault_data[zend_address]} wei. Zend dump: {zend_address_balance} wei.")
            del zend_vault_data[zend_address]

        # Here the only addresses left are not present in zend csv file
        for horizen2_zend_address, _ in zend_vault_data.items():
            set_failed_execution()
            print(f"Zend address {horizen2_zend_address} present in Horizen 2 from Zend file {zend_vault_file_name} not found in Zend dump file {zend_dump_file_name}.")
def main():        
    if len(sys.argv) != 3 and len(sys.argv) != 5:
        print(
            "Usage: check_addresses_balance_from_zend <Zend dump file name> <mapping file> <Zend Vault file> <Eon Vault file>"
        )
        sys.exit(1)


    # Input files
    zend_dump_file_name = sys.argv[1]
    if len(sys.argv) == 3:
        mapping_file_name = None
        zend_vault_file_name = sys.argv[2]
        eon_vault_file_name = None
    else:
        mapping_file_name = sys.argv[2]
        zend_vault_file_name = sys.argv[3]
        eon_vault_file_name = sys.argv[4]

    # Run the data validation
    validate_zend_data(zend_dump_file_name, zend_vault_file_name, mapping_file_name, eon_vault_file_name)

    if failed_zend_check:
        print("Horizen 2 Zend address and balance check failed.")
        sys.exit(1)
    else:
        print("Horizen 2 Zend address and balance check successful.")