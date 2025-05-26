import json
import os
import sys
from web3 import Web3

"""
This script calculates a migration hash from a restore json artifact.
It takes as input:
 - the json file
 - a string identifying the source of the data (eon or zend)
Prints  the calculated migration hash 
"""

def update_hash(previous_hash: str, address: str, value: int, isEon: bool) -> str:
    keyType = "bytes20"
    if isEon:
        keyType = "address"
    
    w3 = Web3()
    encoded = w3.codec.encode(['bytes32', keyType, 'uint256'], [
        bytes.fromhex(previous_hash),
        bytes.fromhex(address[2:]),
        value
    ])
    return w3.keccak(encoded).hex()

def main():
    if len(sys.argv) != 3 or sys.argv[2] not in {"eon", "zend"}:
        print(
            "Usage: migrationhash {} <json file> <eon|zend>"
            .format(os.path.basename(__file__)))
        sys.exit(1)

    input_file_name = sys.argv[1]
    file_type = sys.argv[2]

    with open(input_file_name, 'r') as file:
        data = json.load(file)


    tuples = [(address, data[address]) for address in data.keys()]
    # Order by key
    tuples.sort(key=lambda x: x[0])

    final_hash = "00" * 32  # 32 byte zero
    for address,value in tuples:
        final_hash = update_hash(final_hash, address, value, file_type == "eon")
    print(final_hash)






