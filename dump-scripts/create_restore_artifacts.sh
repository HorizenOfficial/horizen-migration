#!/bin/bash

set -e

if [ "$#" -ne 5 ] && [ "$#" -ne 6 ]; then
  echo "Usage: $0 <network> <zend_dump> <eon_dump> <eon_height> <output_folder> [<eon_rpc_url>]"
  echo "    <network> Network used for the input data (mainnet or testnet) "
  echo "    <zend_dump> Path to Zend dump, obtained with zend dumper command"
  echo "    <eon_dump> Path to EON dump, obtained with zen_dump rpc method on EON"
  echo "    <eon_height>: Height of the EON dump"
  echo "    <output_folder> Output folder of the final artifacts"
  echo "    <eon_rpc_url>: (Optional) EON rpc url. If not specified - the official rpc urls will be used, based on network_type parameter"
  exit 1
fi

network=$1
zenddump=$2
eon_dump=$3
eon_height=$4
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

# Check eon_height parameter
if [[ ! "$eon_height" =~ ^-?[0-9]+$ ]]; then
    echo "Error: eon_height must be an integer"
    exit 1
fi

#eon_rpc_url
eon_rpc_url="https://eon-rpc.horizenlabs.io/ethv1" 
if [ "$#" -eq 6 ]; then
  eon_rpc_url=$6
else
  if [ "$network" == "testnet" ]; then
    eon_rpc_url="https://gobi-rpc.horizenlabs.io/ethv1" 
  fi
fi  
echo "Using EON rpc url: $eon_rpc_url"

# Check output dir
if [ -d "$output_dir" ]; then
    if [ "$(ls -A "$output_dir")" ]; then
        echo "Warning: directory '$output_dir' is not empty!"
        read -p "Do you want to proceed anyway (existing files may be overwritten)? (y/n): " answer
        if [[ ! "$answer" =~ ^[yY]$ ]]; then
          echo "Operation cancelled by the user."
          exit 1
        fi
    fi
else
    echo "Error: output directory '$output_dir' does not exist"
    exit 1
fi
output_dir_abs_path="$(realpath "$output_dir")"
echo "Using output dir: $output_dir_abs_path"

echo ""
echo "*** Converting zend dump:"
output_zend="$output_dir/zend.json"
output_eon_mapping="$output_dir/_automaps.json"
zend_to_horizen $zend_abs_path $mappings_abs_path $output_zend $output_eon_mapping
echo ""
echo "*** Getting EON stakes at height $eon_height:"
output_eon_stakes="$output_dir/_eonstakes.json"
get_all_forger_stakes $eon_height $eon_rpc_url $output_eon_stakes
echo ""
echo "*** Converting eon dump:"
output_eon="$output_dir/eon.json"
setup_eon2_json $eon_abs_path $output_eon_stakes $output_eon_mapping $output_eon
echo ""
echo "Pipeline completed successfully!"
echo "Final artifacts produced here:"
echo "$(realpath "$output_zend")"
echo "$(realpath "$output_eon")"
