import sys
import csv
import os

"""
This python script will require the following input parameters
- mainchain block height related to the mainchain dump
- zend dump file path, the zend dump is the one created through the dumper script
- For mainnet the EON sidechain balance at the mainchain height of the first parameter. It can be retrieved using the following api passing its sidechain ID:
  https://explorer.horizen.io/insight-api/scinfo/37a6ec6f308ef03488f7c2affe56215469d936194ff71c2fe3086aedb718a9fa
  For testnet the sum of the sidechain balances of PREGOBI and GOBI at the mainchain height of the first parameter. They can be retrieved using the following api passing its sidechain ID:
  https://explorer-testnet.horizen.io/insight-api/scinfo/1f758350754c12ac8f75a547f745b75eb744b382e15d0d3b0e24a4b5c5acde00
  https://explorer-testnet.horizen.io/insight-api/scinfo/264a664c87d438b6983e0e071293e0e50b37eb12976eaa2dcd08d6a1ee16ca71
- the network, either 'mainnet' or 'testnet'

It does the following actions:
- calculate the total balance from the height parameter through the calculate_total_supply_from_height and
  remove_shielded_pool_and_sidechains_balance functions.
- calculate
- compare these 2 values, if the difference is above a certain threshold print an error
"""

"""
Regarding total balance calculation, Horizen (like every blockchain based on the bitcoin-core node logic) operates on a deflationary token
economy defined by a halving mechanism that occurs every 840,000 blocks.
At the outset, miners are rewarded with 1,250,000,000 satoshis (12.5 ZEN) for successfully mining a block.
However, this reward is systematically reduced by half after every halving event, creating a diminishing supply rate over time.
For instance, after the first halving, the reward drops to 625,000,000 satoshis (6.25 ZEN), and it continues halving every 840,000 blocks.

However, during the early days of Horizen’s block history some miners:
- did not claim the full 12.5 ZEN they were eligible to claim
- did not include transactions fees of transactions included in the block
This was due to miners using mining software with settings from Zcash or Zclassic (Zcash had 10 ZEC reward).
So the value returned by the function needs to be corrected taking into account these rewards not claimed.
It is possible to retrieve from zend the current ZEN total supply combining the current utxo set, the shielded pool balance and the balance
of all the sidechains and this leads to a difference of 2385.75181127 ZEN.
"""

DIFFERENCE_THRESHOLD = 5000000 # difference threshold in satoshis

def calculate_total_supply_from_height(height):
    HALVING_INTERVAL = 840000
    HZN_EARLY_HISTORY_CORRECTION_MAINNET = 238575181127
    HZN_EARLY_HISTORY_CORRECTION_TESTNET = 4773904298
    HZN_EARLY_HISTORY_CORRECTION = HZN_EARLY_HISTORY_CORRECTION_MAINNET
    if sys.argv[4] == "testnet":
        HZN_EARLY_HISTORY_CORRECTION = HZN_EARLY_HISTORY_CORRECTION_TESTNET
    if height == 0:
        return 0

    tot_halvings = (height - 1) // HALVING_INTERVAL

    if tot_halvings >= 32:
        return 2100000000000000  # max supply reached

    supply = 0
    reward = 1250000000  # block reward in satoshis

    while height > (HALVING_INTERVAL - 1):
        supply += HALVING_INTERVAL * reward
        # Reward is cut in half every 840,000 blocks (~ every 4 years)
        reward >>= 1
        height -= HALVING_INTERVAL

    total_supply = (supply + (height * reward))
    corrected_total_supply = total_supply - HZN_EARLY_HISTORY_CORRECTION
    return corrected_total_supply

"""
To compare the calculated balance from the balance from the zend dump we need to subtract:
- the shielded pool balance, it is a fixed value of 24442.16819948 ZEN
- the total balance of all the ceased sidechains, it is a fixed value of 238.72269980 ZEN
- the balance of EON at the height of the dump, it can be retrieved with the following endpoint passing its sidechain ID:
  https://explorer.horizen.io/insight-api/scinfo/37a6ec6f308ef03488f7c2affe56215469d936194ff71c2fe3086aedb718a9fa
"""
def remove_shielded_pool_and_sidechains_balance(balance):
    # mainnet
    SHIELDED_POOL_BALANCE_MAINNET = 2444216819948
    # every sidechain except eon is considered ceased on mainnet for the purpose of this script
    CEASED_SIDECHAINS_BALANCE_MAINNET = 23873848021

    # testnet
    SHIELDED_POOL_BALANCE_TESTNET = 38137452035245
    # every sidechain except pregobi and gobi is considered ceased on testnet for the purpose of this script
    CEASED_SIDECHAINS_BALANCE_TESTNET = 18089144382722

    SHIELDED_POOL_BALANCE = SHIELDED_POOL_BALANCE_MAINNET
    CEASED_SIDECHAINS_BALANCE = CEASED_SIDECHAINS_BALANCE_MAINNET
    if sys.argv[4] == "testnet":
        SHIELDED_POOL_BALANCE = SHIELDED_POOL_BALANCE_TESTNET
        CEASED_SIDECHAINS_BALANCE = CEASED_SIDECHAINS_BALANCE_TESTNET
    EON_SIDECHAIN_BALANCE = int(sys.argv[3])
    corrected_balance = balance - SHIELDED_POOL_BALANCE - EON_SIDECHAIN_BALANCE - CEASED_SIDECHAINS_BALANCE
    return corrected_balance

def retrieve_balance_from_zend_dump(dump_file_path):
    balance_from_dump = 0
    with open(dump_file_path, 'r') as file:
        csv_reader = csv.reader(file)
        for row in csv_reader:
            balance_from_dump += int(row[1])
    return balance_from_dump

def main():
    if len(sys.argv) != 5:
        print(
            "Usage: check_total_balance_from_zend <mainchain block height> <Zend dump file name> <EON sidechain balance> <mainnet||testnet>"
        )
        sys.exit(1)
    if sys.argv[4] not in ["mainnet", "testnet"]:
        print("The 4th command line argument has to be either 'mainnet' or 'testnet'.")
        sys.exit(1)

    height = int(sys.argv[1])

    calculated_total_supply = calculate_total_supply_from_height(height)
    print(f"Calculated mainchain balance at block {height} is {calculated_total_supply} satoshis")
    total_supply_without_sidechains_and_shielded_pool = remove_shielded_pool_and_sidechains_balance(calculated_total_supply)
    print(f"Mainchain balance at block {height} without sidechains and shielded pool balance is {total_supply_without_sidechains_and_shielded_pool} satoshis")

    zend_dump_file_path = sys.argv[2]
    balance_from_dump = retrieve_balance_from_zend_dump(zend_dump_file_path)
    print(f"The balance from zend dump is {balance_from_dump} satoshis")

    difference = abs(total_supply_without_sidechains_and_shielded_pool - balance_from_dump)
    if difference >= DIFFERENCE_THRESHOLD:
        print(f"Difference between calculated total supply and balance from zend dump is {difference} satoshis, higher than the defined threshold {DIFFERENCE_THRESHOLD}")
        sys.exit(1)
    else:
        print(f"Difference between calculated total supply and balance from zend dump is {difference} satoshis, below the defined threshold {DIFFERENCE_THRESHOLD}")
