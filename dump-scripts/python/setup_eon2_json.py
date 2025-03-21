import collections
import json
import os
import sys

"""
This script transforms the account data dumped from Eon in the format requested for the migration
to Horizen 2.0.
It takes as input:
 - the json file with the data dumped from Eon
 - the json file with the list of Eon delegators and their stakes
 - the output filename to be generated

It creates a json file with the data from Eon in alphabetical order.
Only accounts that aren't smart contracts are saved in the file.
"""

FORGER_STAKES_NATIVE_SMART_CONTRACT = "0x0000000000000000000022222222222222222333"

def is_smart_contract(account_address):
	return account_address == FORGER_STAKES_NATIVE_SMART_CONTRACT

if len(sys.argv) != 4:
	print(
		"Usage: python3 {} <Eon dump file name> <Eon stakes file name> <output_file>"
		.format(os.path.basename(__file__)))
	sys.exit(1)

eon_dump_file_name = sys.argv[1]
eon_stakes_file_name = sys.argv[2]
result_file_name = sys.argv[3]

with open(eon_dump_file_name, 'r') as eon_dump_file:
	eon_dump_data = json.load(eon_dump_file)

results = {}
smart_contract_list = []

# Importing the EON accounts
for account in eon_dump_data['accounts']:
	source_account_data = eon_dump_data['accounts'][account]
	if 'code' not in source_account_data:
		balance = int(source_account_data['balance'])
		if balance != 0:
			results[account.lower()] = balance
	else:
		smart_contract_list.append(account.lower())


# Importing the EON stakes
with open(eon_stakes_file_name, 'r') as eon_stakes_file:
	eon_stakes_data = json.load(eon_stakes_file)

for stake in eon_stakes_data.items():
	account = stake[0].lower()
	if account not in smart_contract_list:
		stake_amount = stake[1]
		if account in results:
			balance = results[account]
			balance = balance + stake_amount
			results[account] = balance
		elif stake_amount != 0:
			results[account] = stake_amount
	else:
		print("Delegator {} is a smart contract".format(account))


sorted_accounts = collections.OrderedDict(sorted(results.items()))

with open(result_file_name, "w") as jsonFile:
	json.dump(sorted_accounts, jsonFile, indent=4)
