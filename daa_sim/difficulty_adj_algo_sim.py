import matplotlib.pyplot as plt
import numpy as np
import statistics 

# --- Simulation Parameters ---
target_block_time = 150  # seconds (2.5 minutes for Horizen)
initial_difficulty = 1.0 # Normalized initial difficulty
initial_hashrate = 1.0   # Normalized initial hashrate
hashrate_drop_factor = 0.3 # 70% drop
drop_height = 100
num_blocks = 500 

# --- Horizen DAA Specific Parameters (from C++ code) ---
DAA_WINDOW_SIZE = 17 # consensus.nPowAveragingWindow

"""
The choice of 11 (an odd number) is deliberate:
Median Calculation: For an odd number of elements, the median is simply the middle value after sorting.
This makes the calculation straightforward and deterministic.
Robustness Against Time-Warp Attacks:
    Using a median instead of a simple average makes the timestamp more resistant to manipulation.
    A malicious miner cannot significantly shift the median by setting an outlier timestamp for just one or two blocks.
    They would need to control a majority (more than half) of the timestamps within the nMedianTimeSpan window to
    significantly affect the median.
    The size 11 is considered a good balance between responsiveness to actual time progression and resistance to manipulation.
    A smaller window would be more susceptible to manipulation, while a much larger window might make the DAA too slow to
    detect actual time changes.
"""
MTP_SIZE = 11

# Clamping factors based on nPowMaxAdjustUp and nPowMaxAdjustDown
# Derived from C++: MinActualTimespan = target_window_timespan / nPowMaxAdjustUp (16)
# MaxActualTimespan = target_window_timespan * nPowMaxAdjustDown (32)
DAA_MAX_DIFFICULTY_FACTOR = 16.0
DAA_MIN_DIFFICULTY_FACTOR = 1.0 / 32.0
nPowMaxAdjustUp_percent = 16  # Corresponds to 16% adjustment up in difficulty
nPowMaxAdjustDown_percent = 32 # Corresponds to 32% adjustment down in difficulty

# file name where plot is written
png_name = "./horizen_daa_simulation.png"


# --- Lists to track state ---
timestamps = [0]  # Timestamp of each block (genesis at t=0)
difficulties = [initial_difficulty]
block_times = [] # Actual time taken for each block
hashrates = [initial_hashrate] * drop_height + [initial_hashrate * hashrate_drop_factor] * (num_blocks - drop_height)

# --- Helper function for Median Time-Past (MTP) ---
def get_median_time_past(current_height, ts_list, window_mtp=MTP_SIZE):
    """
    Calculates the Median Time-Past (MTP) for a given block height.
    MTP is the median of the timestamps of the last 'window_mtp' blocks (including current).
    If not enough blocks exist, it uses all available.
    """
    if current_height < 0:
        return 0 
        
    start_index = max(0, current_height - window_mtp + 1)
    
    relevant_timestamps = ts_list[start_index : current_height + 1]
    
    if len(relevant_timestamps) == 0:
        return 0 
    
    return statistics.median(relevant_timestamps)

# --- Horizen DAA Implementation (based on C++ code) ---
def compute_next_difficulty(
    current_height, 
    ts_list, 
    diff_list, 
    target_spacing, 
    daa_window_size,
    n_pow_max_adjust_up,
    n_pow_max_adjust_down
):
    """
    Simulates Horizen's DAA based directly on C++ code.
    Key features:
    - Averages previous difficulties (targets).
    - Uses Median Time-Past (MTP).
    - Applies a specific dampening formula to nActualTimespan.
    - Clamps nActualTimespan based on nPowMaxAdjustUp/Down.
    """
    
    # 1. Handle early blocks (not enough for full window, include MTP windows that is necessary for instance at block 17)
    if current_height < daa_window_size + MTP_SIZE:
        return diff_list[-1]

    # 2. Calculate bnAvg (Average of Targets)
    # C++: arith_uint256 bnAvg {bnTot / params.nPowAveragingWindow};
    # bnTot is sum of nBits (targets).
    # In normalized system, target = 1.0 / difficulty.
    sum_of_targets = 0.0
    for i in range(daa_window_size):
        # difficulty for block (current_height - 1 - i)
        # diff_list[current_height - 1 - i] is the difficulty SET for that block
        target_for_block = 1.0 / diff_list[current_height - 1 - i]
        sum_of_targets += target_for_block
    
    bnAvg_simulated = sum_of_targets / daa_window_size # This is the average target

    # 3. Calculate nActualTimespan using Median Time Past (MTP)
    # C++: int64_t nActualTimespan = nLastBlockTime - nFirstBlockTime;
    # nLastBlockTime is pindexLast->GetMedianTimePast()
    # nFirstBlockTime is pindexFirst->GetMedianTimePast()
    nLastBlockTime = get_median_time_past(current_height, ts_list)
    nFirstBlockTime = get_median_time_past(current_height - daa_window_size, ts_list)

    nActualTimespan_raw = nLastBlockTime - nFirstBlockTime

    # 4. Apply the dampening formula (unique to this Horizen DAA variant)
    # C++: nActualTimespan = params.AveragingWindowTimespan() + (nActualTimespan - params.AveragingWindowTimespan())/4;
    # params.AveragingWindowTimespan() = params.nPowAveragingWindow * params.nPowTargetSpacing
    target_window_timespan = target_spacing * daa_window_size
    nActualTimespan_dampened = target_window_timespan + (nActualTimespan_raw - target_window_timespan) / 4

    # 5. Apply clamping to the dampened nActualTimespan based on C++ formulas
    # C++: MinActualTimespan() const { return (AveragingWindowTimespan() * (100 - nPowMaxAdjustUp )) / 100; }
    # C++: MaxActualTimespan() const { return (AveragingWindowTimespan() * (100 + nPowMaxAdjustDown)) / 100; }
    min_actual_timespan_clamped = target_window_timespan * (100 - n_pow_max_adjust_up) / 100
    max_actual_timespan_clamped = target_window_timespan * (100 + n_pow_max_adjust_down) / 100

    if nActualTimespan_dampened < min_actual_timespan_clamped:
        nActualTimespan_dampened = min_actual_timespan_clamped
    if nActualTimespan_dampened > max_actual_timespan_clamped:
        nActualTimespan_dampened = max_actual_timespan_clamped

    # 6. Retarget (Calculate new target and then new difficulty)
    # C++: bnNew = bnAvg / params.AveragingWindowTimespan() * nActualTimespan;
    # bnNew is the new target.
    new_target_simulated = bnAvg_simulated * (nActualTimespan_dampened / target_window_timespan)
    
    # 7. Convert new target to new difficulty
    # Difficulty is inverse of target (in normalized system)
    new_difficulty = 1.0 / new_target_simulated
    
    # C++: if (bnNew > bnPowLimit) bnNew = bnPowLimit; (Not implemented in normalized sim, as powLimit is very easy difficulty)
    return new_difficulty

# --- Main simulation loop ---
for height in range(1, num_blocks + 1):
    current_hashrate = hashrates[height - 1]
    current_difficulty = difficulties[-1]
    
    # Simulate block time
    block_time = target_block_time * current_difficulty / current_hashrate
    block_times.append(block_time)
    
    # Append new timestamp to the list
    timestamps.append(timestamps[-1] + block_time)
    
    # Calculate new difficulty using the Horizen-like DAA based on C++ code
    new_difficulty = compute_next_difficulty(
        height, 
        timestamps, 
        difficulties, 
        target_block_time, 
        DAA_WINDOW_SIZE, 
        nPowMaxAdjustUp_percent,
        nPowMaxAdjustDown_percent
    )
    difficulties.append(new_difficulty)


# --- Plotting results ---
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)

# Block time plot
ax1.plot(range(1, num_blocks + 1), block_times, label="Block time (s)", color='blue', alpha=0.7) 
ax1.axhline(target_block_time, color="green", linestyle="--", label="Target Block Time")
ax1.axvline(drop_height, color="red", linestyle=":", label="Hashrate drop")
ax1.set_ylabel("Seconds")
ax1.set_title("Block Time Evolution (Horizen DAA - Deterministic Simulation)")
ax1.legend()
ax1.grid(True, linestyle='--', alpha=0.7)
ax1.set_ylim(bottom=0)

# Difficulty plot
ax2.plot(range(len(difficulties)), difficulties, color="orange", label="Difficulty", alpha=0.8)
ax2.axvline(drop_height, color="red", linestyle=":", label="Hashrate drop")
ax2.set_xlabel("Block Height")
ax2.set_ylabel("Difficulty (Normalized)")
ax2.set_title("Difficulty Adjustment Over Time")
ax2.legend()
ax2.grid(True, linestyle='--', alpha=0.7)
ax2.set_ylim(bottom=0)

plt.tight_layout()
plt.savefig(png_name)
#plt.show()

print("")
print(f"Simulation complete. Final Block Time: {block_times[-1]:.2f}s")
print(f"Final Difficulty: {difficulties[-1]:.4f}")

# --- Analysis: Time for 100 blocks after hashrate drop ---
if num_blocks > (drop_height + 100):
    start_time_drop = timestamps[drop_height] 
    end_time_100_blocks_after_drop = timestamps[drop_height + 100] 
    
    time_for_100_blocks_after_drop_seconds = end_time_100_blocks_after_drop - start_time_drop
    
    # Convert actual time to hours, minutes, seconds
    hours_actual = int(time_for_100_blocks_after_drop_seconds // 3600)
    remaining_seconds_after_hours_actual = time_for_100_blocks_after_drop_seconds % 3600
    minutes_actual = int(remaining_seconds_after_hours_actual // 60)
    final_seconds_actual = remaining_seconds_after_hours_actual % 60

    expected_time_100_blocks_seconds = 100 * target_block_time

    # Convert expected time to hours, minutes, seconds
    hours_expected = int(expected_time_100_blocks_seconds // 3600)
    remaining_seconds_after_hours_expected = expected_time_100_blocks_seconds % 3600
    minutes_expected = int(remaining_seconds_after_hours_expected // 60)
    final_seconds_expected = remaining_seconds_after_hours_expected % 60

    print("------------------------------------------------")
    print(f"Time for 100 blocks at target block time without hashrate drop ({target_block_time}s):")
    print(f"Total: {hours_expected}h {minutes_expected}m {final_seconds_expected:.2f}s ({expected_time_100_blocks_seconds:.2f} seconds)")
    print("------------------------------------------------")
    print(f"Time taken for 100 blocks after hashrate drop (from Block {drop_height} to Block {drop_height + 100}):")
    print(f"Total: {hours_actual}h {minutes_actual}m {final_seconds_actual:.2f}s ({time_for_100_blocks_after_drop_seconds:.2f} seconds)")
    print(f"Average time per block in this period: {time_for_100_blocks_after_drop_seconds / 100:.2f} seconds/block")
    
    print("------------------------------------------------")
else:
    print(f"\nNot enough blocks simulated ({num_blocks}) to analyze 100 blocks after drop height ({drop_height + 100}).")

print(f"Simulation plot saved at: {png_name}")
print("")