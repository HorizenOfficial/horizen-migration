#!/bin/bash

set -e

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <network> <zend_dump> <eon_dump> <eon_stakes> <output_folder>"
  echo "    <network> Network used for the input data (mainnet or testnet) "
  echo "    <zend_dump> Path to Zend dump, obtained with zend dumper command"
  echo "    <eon_dump> Path to EON dump, obtained with zen_dump rpc method on EON"
  echo "    <eon_stakes> Path to EON stakes dump, obtained with pyhton script /python/get_all_forger_stakes.py"
  echo "    <output_folder> Output folder of the final artifacts"
  exit 1
fi

network=$1
zenddump=$2
eon_dump=$3
eon_stakes=$4
output_dir=$5

# check Python3 is installed
if ! command -v python3 &> /dev/null; then
  echo "Error: python3 not available. Please install it"
  exit 1
fi

# Check network parameter
if [ "$network" != "mainnet" ] && [ "$network" != "testnet" ]; then
  echo "Invalid network: must value 'mainnet' or 'testnet'"
  exit 1
fi
if [ "$network" == "mainnet" ]; then
  mappings_relative_path="./automappings/mainnet.json"
else
  mappings_relative_path="./automappings/testnet.json"
fi
mappings_abs_path="$(realpath "$mappings_relative_path")"
echo "Using network: $network"
echo "Using mappings file: $mappings_abs_path"

# Check zend_dump parameter
if [ ! -f "$zenddump" ]; then
  echo "Error: file '$zenddump' not found"
  exit 1
fi
zend_abs_path="$(realpath "$zenddump")"
echo "Using zenddump: $zend_abs_path"

# Check eon_dump parameter
if [ ! -f "$eon_dump" ]; then
  echo "Error: file '$eon_dump' not found"
  exit 1
fi
eon_abs_path="$(realpath "$eon_dump")"
echo "Using eon dump: $eon_abs_path"

# Check eon_stakes parameter
if [ ! -f "$eon_stakes" ]; then
  echo "Error: file '$eon_stakes' not found"
  exit 1
fi
eon_stakes_abs_path="$(realpath "$eon_stakes")"
echo "Using eon stakes: $eon_stakes_abs_path"

# Check output dir
if [ -d "$output_dir" ]; then
    if [ "$(ls -A "$output_dir")" ]; then
        echo "Warning: directory '$output_dir' is not empty!"
        read -p "Do you want to proceed anyway (existing files may be overwritten)? (y/n): " risposta
        if [[ ! "$risposta" =~ ^[yY]$ ]]; then
        echo "Operation cancelled by the user."
        exit 1
        fi
    fi
    else
    echo "Error: output directory '$output_dir' not exists"
    exit 1
fi
output_dir_abs_path="$(realpath "$output_dir")"
echo "Using output dir: $output_dir_abs_path"
echo ""
echo "*** Converting zend dump:"
output_zend="$output_dir/zend.json"
output_eon_mapping="$output_dir/_automaps.json"
python3 python/zend_to_horizen.py $zend_abs_path $mappings_abs_path $output_zend $output_eon_mapping
echo ""
echo "*** Converting eon dump:"
output_eon="$output_dir/eon.json"
python3 python/setup_eon2_json.py $eon_abs_path $eon_stakes_abs_path $output_eon_mapping $output_eon
echo ""
echo "Pipeline completed succesfully!"
echo "Final artifacts produced here:"
echo "$(realpath "$output_zend")"
echo "$(realpath "$output_eon")"
