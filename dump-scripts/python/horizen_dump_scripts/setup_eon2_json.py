import collections
import json
import os
import sys

"""
This script transforms the account data dumped from Eon in the format requested for the migration
to Horizen 2.0.
In case there are zend addresses directly mapped to Ethereum addresses, provided off-chain by the accounts owners, their balances
will be added to the accounts from EON.
It takes as input:
 - the json file with the data dumped from Eon
 - the json file with the list of Eon delegators and their stakes
 - the json file with the Ethereum accounts where the some zend addresses were mapped to (optional)
 - the output filename to be generated.

It creates a json file with the elements in alphabetical order.
The following accounts are not saved in the file:
 - accounts with 0 balance and no stakes 
 - smart contract accounts 
 - 0x0000000000000000000000000000000000000000 account
"""
def main():
	NULL_ACCOUNT = "0x0000000000000000000000000000000000000000"

	if len(sys.argv) != 4 and len(sys.argv) != 5 :
		print(
			"Usage: setup_eon2_json <Eon dump file name> <Eon stakes file name> <eon_vault_automappings_file> <output_file>"
		)
		sys.exit(1)

	eon_dump_file_name = sys.argv[1]
	eon_stakes_file_name = sys.argv[2]
	zend_file_name = ""

	if  len(sys.argv) == 4:
		result_file_name = sys.argv[3]
	else:
		zend_file_name = sys.argv[3]
		result_file_name = sys.argv[4]


	with open(eon_dump_file_name, 'r') as eon_dump_file:
		eon_dump_data = json.load(eon_dump_file)

	results = {}
	smart_contract_list = []

	total_balance = 0
	total_restored_balance = 0
	total_filtered_balance = 0

	class Top20:
		def __init__(self):
			self.items = []

		def add_item(self, new_item):
			self.items.append(new_item)


		def print_items(self):
			self.items.sort(key=lambda x: x['amount'], reverse=True)
			i = 0
			for item in self.items:
				if i<20:
					print(f"{item['id']}, {item['amount']}")
				i = i + 1


	top_20_not_migrated_contracts = Top20()
	total_contracts = 0

	# Importing the EON accounts
	for account, account_data in eon_dump_data['accounts'].items():
		balance = int(account_data['balance'])
		total_balance = total_balance + balance
		if 'code' not in account_data:
			if account == NULL_ACCOUNT:
				total_filtered_balance = total_filtered_balance + balance
			elif balance != 0:
				results[account.lower()] = balance
				total_restored_balance = total_restored_balance + balance
		else:
			smart_contract_list.append(account.lower())		
			total_filtered_balance = total_filtered_balance + balance
			top_20_not_migrated_contracts.add_item({'id': account.lower(), 'amount': balance})
			total_contracts = total_contracts + 1


	# Importing the EON stakes
	with open(eon_stakes_file_name, 'r') as eon_stakes_file:
		eon_stakes_data = json.load(eon_stakes_file)

	total_stakes = 0
	for account, stake_amount in eon_stakes_data.items():
		account = account.lower()
		total_stakes = total_stakes + stake_amount
		if account not in smart_contract_list and account != NULL_ACCOUNT:
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
			print(" its balance is {}".format(stake_amount))

	total_from_zend = 0
	# Importing Ethereum-mapped zend accounts
	if  len(sys.argv) == 5:
		with open(zend_file_name, 'r') as zend_file:
			zend_data = json.load(zend_file)
			for account, amount in zend_data.items():
				account = account.lower()
				total_from_zend = total_from_zend + amount
				total_balance = total_balance + amount
				total_restored_balance = total_restored_balance + amount

				if account in results:
					balance = results[account]
					balance = balance + amount
					results[account] = balance
				elif amount != 0:
					results[account] = amount


	print("Total balance from EON (EOA + Contracts + Stakes + Zend):                          {}".format(total_balance))
	print("Total stakes:                                                                      {}".format(total_stakes))
	print("Total zend  :                                                                      {}".format(total_from_zend))
	print("Total balance from EON migrated (EOA + EOA Stakes + Zend):                         {}".format(total_restored_balance))
	print("Total balance from EON not restored (Contracts + Contracts Stakes + NULL address): {}".format(total_filtered_balance))
	print("Top 20 NOT migrated contracts by ZEN balance:")
	top_20_not_migrated_contracts.print_items()
	print("Total NOT migrated contracts: {}".format(total_contracts))



	assert total_balance == (total_restored_balance + total_filtered_balance), "Total balance is different from the sum of restored and filtered balances"
	sorted_accounts = collections.OrderedDict(sorted(results.items()))

	with open(result_file_name, "w") as jsonFile:
		json.dump(sorted_accounts, jsonFile, indent=4)
