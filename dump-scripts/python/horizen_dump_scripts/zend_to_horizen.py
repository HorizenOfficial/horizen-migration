import collections
import csv
import json
import sys
from web3 import Web3
import base58
import pprint
from horizen_dump_scripts.utils import dict_raise_on_duplicates
"""
This script transforms the balances data dumped from zend in the format requested for Horizen. 
Most accounts will be restored in ZendBackVault contract and they will need to be explicitly claimed by the owners to 
transfer their balances to an Ethereum address.
For some external partners (CEX), not able to generate claim message signatures, a direct mapping to Ethereum addresses 
will be provided offchain. These accounts will be restored in EonBackVault contract. The list of these accounts is 
provided as an input file to this script.

The accounts that will be restored by ZendBackVault contract will be saved in a json file with the format:
<"decoded address":"balance">, alphabetically ordered.
The "decoded address" is the original zend address Base58-decoded and with the prefix removed.
The balances are converted from satoshis (or "zennies") to weis.     
It may happen that multiple Zend addresses were created from the same public key. In this case, all the balances are
added to the same decoded address (that, in the end, it is a double hash of the pub key). 

The accounts that will be restored by EonBackVault contract will be saved in a json file with the format:
<"Ethereum address":"balance">, alphabetically ordered.
The "Ethereum address" is the address specified in the input mapping file, lower case.
The balances are converted from satoshis (or "zennies") to weis. 
In case more than one zend address is mapped to the same Ethereum address, the balances will be added up.  

This script requires as input:
 - The mainchain network type the addresses belong to ("mainnet" or "testnet"). Optional, required if the mapping file was provided as input (see below).
 - The dump of the zend accounts with their balances, as a csv file with the following format:
 	<zend address, balance in satoshi>
 - (Optional) The list of the zend addresses to be directly mapped to Ethereum addresses, as a json file with the following format:
    <zend address, Ethereum address>
    If this parameter is provided, also mainchain network type and the name of the file with the accounts to be restored by the EonBackVault contract must be provided.
It creates as output:
 - The list of the accounts to be restored by the ZendBackVault contract, as a json file with the format:
	<"decoded address":"balance">, alphabetically ordered.
 - If the mapping file was provided as input, the list of the accounts to be restored by the EonBackVault contract, as a json file with the format:
    <"Ethereum address":"balance">, alphabetically ordered.
"""

Mainnet_Prefix_List = [
"2089", # "zn"
"1CB8", # "t1"
"2096", # "zs" (it can also appear as "zt" once Base58 encoded)
"1CBD"  # "t3"
]

Testnet_Prefix_List = [
"2098", # "zt"
"1D25", # "tm"
"2092", # "zr"
"1CBA"  # "t2"
]


def main():
	# 10 ^ 10
	SATOSHI_TO_WEI_MULTIPLIER = 10 ** 10

	def satoshi_2_wei(value_in_satoshi):
		return SATOSHI_TO_WEI_MULTIPLIER * value_in_satoshi

	if len(sys.argv) != 3 and len(sys.argv) != 6:
		print(
			"Usage: \n"
			"      Without automapping file: zend_to_horizen <zend dump file name> <zend_vault_output_file>\n"
			"      With automapping file: zend_to_horizen <mainnet|testnet> <zend dump file name> <mapping file name> <zend_vault_output_file> <eon_vault_automappings_file>\n"
		)
		sys.exit(1)

	mapped_addresses = {}

	if len(sys.argv) == 3:
		zend_dump_file_name = sys.argv[1]
		zend_vault_result_file_name = sys.argv[2]
		eon_vault_result_file_name = None
	else:
		network_type = sys.argv[1]
		if network_type != "mainnet" and network_type != "testnet":
			print(
				"Wrong network type, it can be only 'mainnet' or 'testnet'"
			)
			sys.exit(1)

		zend_dump_file_name = sys.argv[2]
		mapping_file_name = sys.argv[3]
		zend_vault_result_file_name = sys.argv[4]
		eon_vault_result_file_name = sys.argv[5]
		with open(mapping_file_name, 'r') as mapping_file:
			mapped_addresses = json.load(mapping_file, object_pairs_hook=dict_raise_on_duplicates)
			# Sanity checks
			print("\nChecking automapping addresses.")
			if network_type == "mainnet":
				expected_network_prefixes = Mainnet_Prefix_List
			else:
				expected_network_prefixes = Testnet_Prefix_List
			malformed_eth_addresses = []
			malformed_zend_addresses_with_reasons = []
			for zend_address, eth_address in mapped_addresses.items():
				if Web3.is_checksum_address(eth_address) is False:
					malformed_eth_addresses.append(eth_address)
				try:
					decoded_address = base58.b58decode_check(zend_address).hex()
					network_prefix = decoded_address[:4]
					if network_prefix not in expected_network_prefixes:
						print(f"Wrong network type for Mainchain addresses. Expected {network_type}, found {network_prefix}")
						# The hypothesis is that it is probable that all the addresses belong to the same network and so
						# that this error is not due to a typo on a single address but to a wrong automapping file instead.
						# In this case, the script exits immediately.
						sys.exit(1)

				except Exception as e:
					malformed_zend_addresses_with_reasons.append(f"{zend_address}, reason: {e}")

			malformed = False
			if len(malformed_eth_addresses) != 0:
				malformed = True
				print("\nFound malformed Ethereum addresses or not in EIP-55 format: ")
				pprint.pprint(malformed_eth_addresses)

			if len(malformed_zend_addresses_with_reasons) != 0:
				malformed = True
				print("\nFound malformed Zend addresses: ")
				pprint.pprint(malformed_zend_addresses_with_reasons)

			if malformed:
				print("\nExiting.")
				sys.exit(1)

			print("Automapping addresses are correct.\n")

	total_balance_from_zend = 0
	total_balance_to_zend_vault = 0
	total_balance_to_eon_vault = 0
	total_balance_not_migrated = 0

	with open(zend_dump_file_name, 'r') as zend_dump_file:
		zend_dump_data_reader = csv.reader(zend_dump_file)

		zend_vault_results = {}
		eon_vault_results = {}

		processed_zend_accounts = set()

		for (zend_address, balance_in_satoshi, _) in zend_dump_data_reader:
			if zend_address in processed_zend_accounts:
				print(f"Found duplicated address: {zend_address}. Exiting")
				sys.exit(1)

			processed_zend_accounts.add(zend_address)
			balance_in_wei = satoshi_2_wei(int(balance_in_satoshi))
			total_balance_from_zend = total_balance_from_zend + balance_in_wei
			
			if not zend_address.startswith("unknown"):
				if balance_in_wei != 0:
					if zend_address in mapped_addresses:
						mapped_eth_address = mapped_addresses[zend_address].lower()
						eon_vault_results[mapped_eth_address] = eon_vault_results.get(mapped_eth_address, 0) + balance_in_wei
						total_balance_to_eon_vault = total_balance_to_eon_vault + balance_in_wei
						mapped_addresses.pop(zend_address)
					else:
						try:
							decoded_address = base58.b58decode_check(zend_address).hex()
							# Remove prefix
							decoded_address = "0x" + decoded_address[4:]
							total_balance_to_zend_vault = total_balance_to_zend_vault + balance_in_wei
							if decoded_address in zend_vault_results:
								print(
									"Found 2 equal hashes. Hash: {0}, balance 1: {1}, balance 2: {2}, current zend address: {3}"
									.format(decoded_address, zend_vault_results[decoded_address], balance_in_wei, zend_address))
								zend_vault_results[decoded_address] = zend_vault_results[decoded_address] + balance_in_wei
							else:
								zend_vault_results[decoded_address] = balance_in_wei
						except Exception as e:
							print(
								"Error {2} while processing line with address: {0}, balance: {1}. The file is corrupted, exiting."
								.format(zend_address, balance_in_satoshi, e))
							sys.exit(1)
				else:
					print(
						"Found address with zero balance: {0}"
						.format(zend_address))
			else:
				total_balance_not_migrated = total_balance_not_migrated + balance_in_wei
				print(
					"Found an unknown address: {0}, with balance in wei {1}"
					.format(zend_address, balance_in_wei))


	if len(mapped_addresses) != 0:
		print("\nFound mapped addresses without a balance: ")
		print(mapped_addresses)

	print("\nTotal balance from Zend: {}".format(total_balance_from_zend))
	print("Total balance migrated from Zend to Zend vault: {}".format(total_balance_to_zend_vault))
	print("Total balance migrated from Zend to EON vault: {}".format(total_balance_to_eon_vault))
	print("Total balance not migrated from Zend for unknown addresses: {}".format(total_balance_not_migrated))

	assert total_balance_to_zend_vault + total_balance_to_eon_vault + total_balance_not_migrated == total_balance_from_zend, "balances don't match"

	sorted_zend_vault_accounts = collections.OrderedDict(sorted(zend_vault_results.items()))

	with open(zend_vault_result_file_name, "w") as jsonFile:
		json.dump(sorted_zend_vault_accounts, jsonFile, indent=4)

	if eon_vault_result_file_name is not None:
		sorted_eon_vault_accounts = collections.OrderedDict(sorted(eon_vault_results.items()))

		with open(eon_vault_result_file_name, "w") as jsonFile:
			json.dump(sorted_eon_vault_accounts, jsonFile, indent=4)
