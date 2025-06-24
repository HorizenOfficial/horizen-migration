# Horizen DAA Simulation

This document provides a Python script that simulates the Horizen **Difficulty Adjustment Algorithm (DAA)**. This simulation is deterministic, meaning it omits random fluctuations in block times to demonstrate the DAA's adjustment behavior. The formulas and logic are derived from the Horizen codebase. See especially:

https://github.com/HorizenOfficial/zen/blob/main/src/pow.cpp

https://github.com/HorizenOfficial/zen/blob/main/src/chainparams.cpp

https://github.com/HorizenOfficial/zen/blob/main/src/chain.h

https://github.com/HorizenOfficial/zen/blob/main/src/consensus/params.h

---

## 1. Simulation Parameters

These parameters define the environment and conditions for the simulation:

* `target_block_time = 150` (seconds):
    * **Description:** The desired average time (in seconds) that should elapse between the mining of consecutive blocks on the blockchain. For Horizen, this is typically 2.5 minutes.
    * **C++ Reference:** Corresponds to `consensus.nPowTargetSpacing` in the C++ `Consensus::Params`.

* `initial_difficulty = 1.0`:
    * **Description:** A normalized starting value for the blockchain's mining difficulty. In this simulation, `1.0` serves as a baseline where, with an `initial_hashrate` of `1.0`, the `target_block_time` is perfectly achieved.
    * **C++ Reference:** Conceptually related to the `powLimit` for the genesis block in C++, which represents the easiest possible difficulty.

* `initial_hashrate = 1.0`:
    * **Description:** A normalized starting value for the total computational power (hashrate) contributed by all miners on the network.
    * **C++ Reference:** No direct equivalent in C++ parameters, as hashrate is an external, dynamic network variable.

* `hashrate_drop_factor = 0.3`:
    * **Description:** The factor by which the `initial_hashrate` will be multiplied to simulate a sudden decrease in network mining power. A value of `0.3` implies a 70% drop (new hashrate will be 30% of the initial).

* `drop_height = 100`:
    * **Description:** The specific block height at which the simulated `hashrate_drop_factor` is applied.

* `num_blocks = 500`:
    * **Description:** The total number of blocks for which the simulation will run. This value should be sufficiently large to observe the DAA's convergence behavior and allow for post-drop analysis (e.g., `drop_height + 100` blocks for the analysis printed in the console).

---

## 2. Horizen DAA Specific Parameters (from C++ `Consensus::Params`)

These parameters are directly extracted or derived from the provided C++ `CMainParams` class and are fundamental to the Horizen DAA's operation.

* `DAA_WINDOW_SIZE = 17`:
    * **Description:** The primary window size for the DAA, representing the number of preceding blocks whose averaged properties (like targets) are used for difficulty calculation.
    * **C++ Reference:** `consensus.nPowAveragingWindow`.

* `MTP_SIZE = 11`:
    * **Description:** The window size used for calculating the Median Time-Past (MTP) of a block. The MTP is the median of the timestamps of the last `MTP_SIZE` blocks. This ensures robustness against timestamp manipulation.
    * **C++ Reference:** Typically defined as `nMedianTimeSpan` in `src/chain.h` or `src/consensus/consensus.h`.

* `nPowMaxAdjustUp_percent = 16`:
    * **Description:** Defines the maximum percentage decrease in the `nActualTimespan` allowed. This translates to a maximum percentage *increase* in difficulty. A value of `16` means `nActualTimespan` cannot be less than `(100 - 16)% = 84%` of the target window timespan.
    * **C++ Reference:** `consensus.nPowMaxAdjustUp`. Used in `MinActualTimespan()`.

* `nPowMaxAdjustDown_percent = 32`:
    * **Description:** Defines the maximum percentage increase in the `nActualTimespan` allowed. This translates to a maximum percentage *decrease* in difficulty. A value of `32` means `nActualTimespan` cannot be more than `(100 + 32)% = 132%` of the target window timespan.
    * **C++ Reference:** `consensus.nPowMaxAdjustDown`. Used in `MaxActualTimespan()`.

* `DAA_MAX_DIFFICULTY_FACTOR` and `DAA_MIN_DIFFICULTY_FACTOR`:
    * **Note:** These variables are present in the Python script for historical context but are no longer directly used as parameters in the `compute_next_difficulty` function call, as the clamping logic now directly uses `nPowMaxAdjustUp_percent` and `nPowMaxAdjustDown_percent` according to the C++ formulas.

---

## 3. Core Simulation Logic Explained

The simulation proceeds block by block, updating the blockchain state (timestamps, difficulties) and calculating the next difficulty based on the DAA.

### 3.1 `block_time` Calculation

The `block_time` for each simulated block is calculated deterministically based on the current network conditions:

$$ \text{block\_time} = \text{target\_block\_time} \times \frac{\text{current\_difficulty}}{\text{current\_hashrate}} $$

* `target_block_time`: The desired constant block interval (e.g., 150 seconds).
* `current_difficulty`: The difficulty value set for the current block.
* `current_hashrate`: The total hashing power of the network at the current block height.

### 3.2 `get_median_time_past(current_height, ts_list, window_mtp=MTP_SIZE)`

This helper function calculates the Median Time-Past (MTP) for a given block.

* **Purpose:** To compute a robust timestamp that is resistant to manipulation.
* **Methodology:** It collects `window_mtp` (defaulting to `MTP_SIZE = 11`) most recent block timestamps (including the current one) and returns their median. If fewer than `window_mtp` blocks are available, it uses all existing timestamps.
* **C++ Reference:** This function directly emulates `CBlockIndex::GetMedianTimePast()` from the C++ codebase.

### 3.3 `compute_next_difficulty(...)`

This is the core function that implements the Horizen DAA logic to calculate the `new_difficulty` for the subsequent block, mirroring the C++ `GetNextWorkRequired` and `CalculateNextWorkRequired` functions.

#### 1. Handle Early Blocks

* **Logic:**
    ```python
    if current_height < daa_window_size + MTP_SIZE:
        return diff_list[-1]
    ```
* **Explanation:** The DAA requires sufficient historical data (both for its main window and for the MTP calculations within that window) to make an accurate adjustment. This condition ensures the DAA remains inactive and the difficulty constant until enough blocks (`DAA_WINDOW_SIZE + MTP_SIZE` = 17 + 11 = 28 blocks) have been mined.

#### 2. Calculate `bnAvg` (Average of Targets)

* **Purpose:** To compute the arithmetic mean of the mining targets over the `DAA_WINDOW_SIZE` (17) previous blocks.
* **Logic:** The function sums the normalized target values (`1.0 / difficulty`) for the last 17 blocks and divides by 17.
* **C++ Reference:** Mirrors `arith_uint256 bnAvg {bnTot / params.nPowAveragingWindow};` where `bnTot` is the sum of `nBits` (compressed target values).

#### 3. Calculate Raw `nActualTimespan`

* **Purpose:** To determine the actual time elapsed over the DAA window using robust MTP timestamps.
* **Logic:**
    ```python
    nLastBlockTime = get_median_time_past(current_height, ts_list)
    nFirstBlockTime = get_median_time_past(current_height - daa_window_size, ts_list)
    nActualTimespan_raw = nLastBlockTime - nFirstBlockTime
    ```
* **Explanation:** This calculates the difference between the MTP of the current block (`pindexLast`) and the MTP of the block exactly `DAA_WINDOW_SIZE` (17) blocks ago (`pindexFirst` in C++). This ensures `nActualTimespan_raw` correctly measures the time over the full DAA window.
* **C++ Reference:** `int64_t nActualTimespan = nLastBlockTime - nFirstBlockTime;` in `CalculateNextWorkRequired`, where `nFirstBlockTime` corresponds to `pindexFirst->GetMedianTimePast()` after `pindexFirst` has been moved back `DAA_WINDOW_SIZE` times.

#### 4. Apply Dampening to `nActualTimespan`

* **Purpose:** To smooth out the `nActualTimespan` and make the difficulty adjustment less volatile by limiting the immediate impact of deviations.
* **Logic:**
    $$
    \text{nActualTimespan\_dampened} = \text{target\_window\_timespan} + \frac{\text{nActualTimespan\_raw} - \text{target\_window\_timespan}}{4}
    $$
    Where `target_window_timespan = target_spacing * daa_window_size` (e.g., $150 \times 17 = 2550$ seconds).
* **Explanation:** Only 25% of the deviation from the `target_window_timespan` is applied.
* **C++ Reference:** `nActualTimespan = params.AveragingWindowTimespan() + (nActualTimespan - params.AveragingWindowTimespan())/4;`

#### 5. Apply Clamping to Dampened `nActualTimespan`

* **Purpose:** To set hard limits on the maximum and minimum values that `nActualTimespan_dampened` can take, based on the `nPowMaxAdjustUp_percent` and `nPowMaxAdjustDown_percent` parameters.
* **Logic:**
    $$
    \text{min\_actual\_timespan\_clamped} = \text{target\_window\_timespan} \times \frac{(100 - \text{nPowMaxAdjustUp\_percent})}{100}
    $$
    $$
    \text{max\_actual\_timespan\_clamped} = \text{target\_window\_timespan} \times \frac{(100 + \text{nPowMaxAdjustDown\_percent})}{100}
    $$
    The `nActualTimespan_dampened` is then constrained within these values.
* **Effective Difficulty Adjustment Factors:**
    * **Maximum Difficulty Increase:** If `nActualTimespan_dampened` hits `min_actual_timespan_clamped`, the difficulty increases by a factor of $\frac{100}{(100 - \text{nPowMaxAdjustUp\_percent})} = \frac{100}{(100 - 16)} = \frac{100}{84} \approx 1.19$ (approx. 19% increase).
    * **Maximum Difficulty Decrease:** If `nActualTimespan_dampened` hits `max_actual_timespan_clamped`, the difficulty decreases by a factor of $\frac{100}{(100 + \text{nPowMaxAdjustDown\_percent})} = \frac{100}{(100 + 32)} = \frac{100}{132} \approx 0.757$ (approx. 24.3% decrease).
* **C++ Reference:** `if (nActualTimespan < params.MinActualTimespan())` and `if (nActualTimespan > params.MaxActualTimespan())`, where `MinActualTimespan()` and `MaxActualTimespan()` are calculated using the percentage logic.

#### 6. Retarget (Calculate New Difficulty)

* **Purpose:** To compute the new mining difficulty for the next block based on the averaged targets and the adjusted actual timespan.
* **Logic:**
    ```python
    new_target_simulated = bnAvg_simulated * (nActualTimespan_dampened / target_window_timespan)
    new_difficulty = 1.0 / new_target_simulated
    ```
* **Formula (Target-based):**
    $$ \text{New\_Target} = \text{Average\_Target} \times \frac{\text{nActualTimespan\_dampened}}{\text{target\_window\_timespan}} $$
* **Formula (Difficulty-based):**
    $$ \text{New\_Difficulty} = \frac{1.0}{\text{New\_Target}} $$
* **C++ Reference:** `bnNew = bnAvg / params.AveragingWindowTimespan() * nActualTimespan;` where `bnNew` is the new target.

---

## 4. Simulation Analysis / Output Metrics

The script provides detailed logging in the console after the simulation runs:

* **Final Block Time:** The `block_time` of the very last block simulated.
* **Final Difficulty:** The `difficulty` of the very last block simulated.
* **Time for 100 blocks at target block time without hashrate drop:**
    * Calculates the ideal time it *should* take to mine 100 blocks if the network consistently maintained the `target_block_time`.
    * Presented in `hours h minutes m seconds.xx s` format for clarity.
* **Time taken for 100 blocks after hashrate drop:**
    * Measures the actual time elapsed between Block `drop_height` (start of hashrate drop) and Block `drop_height + 100`.
    * Presented in `hours h minutes m seconds.xx s` format for clarity.
    * Includes the `Average time per block in this period`. This metric is crucial for evaluating how effectively the DAA adjusted to the hashrate change and brought the block time back towards the target average.