import collections
import csv
import json
import os
import sys

import base58

"""
This script transforms the balances data dumped from zend in the format requested for Horizen. 
Specifically:
 - the zend addresses are Base58 decoded and the prefix is removed 
 - the balances are converted from satoshis (or "zennies") to weis.
It may happen that multiple Zend addresses were created from the same public key. In this case, all the balances are
added to the same decoded address (that, in the end, it is a double hash of the pub key). 
It requires as input a csv with the following format:
 <zend address, balance in satoshi>
It creates as output another json file with the format:
<"decoded address":"balance">, alphabetically ordered.
"""

# 10 ^ 10
SATOSHI_TO_WEI_MULTIPLIER = 10 ** 10

def satoshi_2_wei(value_in_satoshi):
	return int(round(SATOSHI_TO_WEI_MULTIPLIER * value_in_satoshi))

if len(sys.argv) != 3:
	print(
		"Usage: python3 {} <zend dump file name> <output_file>"
		.format(os.path.basename(__file__)))
	sys.exit(1)

zend_dump_file_name = sys.argv[1]
result_file_name = sys.argv[2]

total_balance = 0

with open(zend_dump_file_name, 'r') as zend_dump_file:
	zend_dump_data_reader = csv.reader(zend_dump_file)

	results = {}

	for (zend_address, balance_in_satoshi, _) in zend_dump_data_reader:
		decoded_address = base58.b58decode_check(zend_address).hex()
		# Remove prefix
		decoded_address = "0x" + decoded_address[4:]
		balance_in_wei = satoshi_2_wei(int(balance_in_satoshi))
		total_balance = total_balance + balance_in_wei
		if decoded_address in results:
			print(
				"Found 2 equal hashes: {0}, balance 1 {1}, balance 2 {2}"
				.format(decoded_address, results[decoded_address], balance_in_wei ))
			results[decoded_address] = results[decoded_address] + balance_in_wei
		else:
			results[decoded_address] = balance_in_wei

print("Total balance migrated from Zend: {}".format(total_balance))

sorted_accounts = collections.OrderedDict(sorted(results.items()))

with open(result_file_name, "w") as jsonFile:
	json.dump(results, jsonFile, indent=4)