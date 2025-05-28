import os
import sys
import json

from horizen_dump_scripts.utils import dict_raise_on_duplicates
"""
This python script requires the following input parameters:
- EON dump json file, created by "zen_dump" rpc command 
- EON stakes list json file, created by get_all_forger_stakes.py script
- the json file with the Ethereum accounts where the some zend addresses were mapped to (optional)
- Horizen 2 json file created by setup_eon2_json.py script

It will compare addresses and balances between Horizen 2 file and the other files.
If something goes wrong (balances don't match or an address is missing), it will be printed in terminal.
At the end of the execution a message will confirm if the global check was successful or not.

The first check is related to EON addresses. The list from EON dump will be updated with the stakes.
The smart contract addresses and all the accounts with 0 balance will be excluded from the check because the 
setup_eon2_json.py script will not include them in the Horizen 2 file.
Then the addresses and the balances related to EON will be checked in search of missing address or mismatch in the balance.

"""
NULL_ACCOUNT = "0x0000000000000000000000000000000000000000"

# Global variable to keep track of failed checks
failed_horizen2_check = False
def set_failed_execution():
    global failed_horizen2_check
    failed_horizen2_check = True


# Filtered accounts are the ones with a 0 balance, smart contracts or the Null address.
def is_filtered_account(account_address, eon_dump_data):
    return ('code' in eon_dump_data[account_address]) or (int(eon_dump_data[account_address]['balance']) == 0) or (account_address == NULL_ACCOUNT)


# Update the EON balances with accounts from the Eon stakes or from Zend. If the address is present in the EON dump, it updates its balance otherwise add the address/balance pair
def update_eon_dump(eon_dump_data, additional_data):
    for account, amount in additional_data.items():
        account = account.lower()

        if account in eon_dump_data:
            balance = int(eon_dump_data[account]['balance'])
            balance += amount
            eon_dump_data[account]["balance"] = balance
        else:
            new_account = {"balance": amount}
            eon_dump_data[account] = new_account
    return eon_dump_data


def validate_eon_data(eon_dump_file_name, eon_stakes_file_name, zend_file_name, horizen2_file_name):
    with open(eon_dump_file_name, 'r') as eon_dump_file, open(horizen2_file_name, 'r') as horizen2_file, open(eon_stakes_file_name, 'r') as eon_stakes_file:
        eon_dump = json.load(eon_dump_file, object_pairs_hook=dict_raise_on_duplicates)
        horizen2_eon_data = json.load(horizen2_file, object_pairs_hook=dict_raise_on_duplicates)

        eon_stakes_data = json.load(eon_stakes_file, object_pairs_hook=dict_raise_on_duplicates)

        eon_dump_data = update_eon_dump(eon_dump["accounts"], eon_stakes_data)

        if zend_file_name != "":
            with open(zend_file_name, 'r') as zend_file:
                zend_data = json.load(zend_file, object_pairs_hook=dict_raise_on_duplicates)
                eon_dump_data = update_eon_dump(eon_dump_data, zend_data)

        counter = 0

        for horizen2_eon_address, horizen2_eon_address_balance in horizen2_eon_data.items():
            counter = counter + 1
            if horizen2_eon_address in eon_dump_data:
                eon_address_balance = int(eon_dump_data[horizen2_eon_address]['balance'])
                if horizen2_eon_address_balance != eon_address_balance:
                    set_failed_execution()
                    print(f"EON address {horizen2_eon_address} balances do not match. Horizen2 data: {horizen2_eon_address_balance} wei. EON dump data: {eon_address_balance} wei.")
            else:
                set_failed_execution()
                print(f"EON address {horizen2_eon_address} present in Horizen2 file {horizen2_file_name} not found in EON dump data file {eon_dump_file_name}.")

        
        counter_inverse = 0
        for eon_address in eon_dump_data:
            if not(is_filtered_account(eon_address, eon_dump_data)):
                counter_inverse = counter_inverse + 1
            if eon_address not in horizen2_eon_data and not is_filtered_account(eon_address, eon_dump_data):
                set_failed_execution()
                print(f"EON address {eon_address} present in EON dump data file {eon_dump_file_name} not found in Horizen2 file {horizen2_file_name}.")
        
        assert counter > 0, "No account found in Horizen2 file"
        assert counter == counter_inverse, "Different number of accounts in EON dump data than in Horizen 2"
        print(f"checked {counter} EON addresses")

def main():
    if len(sys.argv) != 4 and len(sys.argv) != 5:
        print(
            "Usage: check_addresses_balance_from_eon {} <Eon dump file name> <Eon stakes file name> <Zend accounts file name> <Horizen2 file>"
            .format(os.path.basename(__file__)))
        sys.exit(1)


    zend_file_name = ""
    eon_dump_file_name = sys.argv[1]
    eon_stakes_file_name = sys.argv[2]
    if len(sys.argv) == 4:
        horizen2_file_name = sys.argv[3]
    else:
        zend_file_name = sys.argv[3]
        horizen2_file_name = sys.argv[4]

    validate_eon_data(eon_dump_file_name, eon_stakes_file_name, zend_file_name, horizen2_file_name)

    if failed_horizen2_check:
        print("Horizen 2 address and balance check failed.")
        sys.exit(1)
    else:
        print("Horizen 2 address and balance check successful.")
