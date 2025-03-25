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

total_balance = 0
total_restored_balance = 0
total_filtered_balance = 0

# Importing the EON accounts
for account in eon_dump_data['accounts']:
	source_account_data = eon_dump_data['accounts'][account]
	balance = int(source_account_data['balance'])
	total_balance = total_balance + balance
	if 'code' not in source_account_data:
		if balance != 0:
			results[account.lower()] = balance
			total_restored_balance = total_restored_balance + balance
	else:
		smart_contract_list.append(account.lower())
		total_filtered_balance = total_filtered_balance + balance


# Importing the EON stakes
with open(eon_stakes_file_name, 'r') as eon_stakes_file:
	eon_stakes_data = json.load(eon_stakes_file)

total_stakes = 0
for stake in eon_stakes_data.items():
	account = stake[0].lower()
	stake_amount = stake[1]
	total_stakes = total_stakes + stake_amount
	if account not in smart_contract_list:
		# Forger Stakes native smart contract balance is equal to all the stakes + any possible direct transfer.
		# total_balance doesn't need to be updated because the stakes amount were already added before.
		# If the stake belongs to an EOA, stake_amount needs to be added to total_restored_balance and to be removed
		# from total_filtered_balance.
		total_restored_balance = total_restored_balance + stake_amount
		total_filtered_balance = total_filtered_balance - stake_amount
		if account in results:
			balance = results[account]
			balance = balance + stake_amount
			results[account] = balance
		elif stake_amount != 0:
			results[account] = stake_amount
	else:
		print("Delegator {} is a smart contract".format(account))

print("Total balance from EON (EOA + Contracts + Stakes):                  {}".format(total_balance))
print("Total stakes:                                                       {}".format(total_stakes))
print("Total balance from EON migrated (EOA + EOA Stakes):                 {}".format(total_restored_balance))
print("Total balance from EON not restored (Contracts + Contracts Stakes): {}".format(total_filtered_balance))


assert total_balance == (total_restored_balance + total_filtered_balance)
sorted_accounts = collections.OrderedDict(sorted(results.items()))

with open(result_file_name, "w") as jsonFile:
	json.dump(sorted_accounts, jsonFile, indent=4)
