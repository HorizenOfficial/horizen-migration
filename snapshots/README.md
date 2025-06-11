# About this folder

- Snapshot files for the respective networks will be stored in the `testnet/` and `mainnet/` folders once the snapshots have been taken
- Independent verifications of the accuracy of the migration hash can be submitted via Pull Request and should be stored in the `{network}/signatures/` subfolder

## Submitting snapshot results
Multiple people from the Horizen team will independently create migration snapshots. Results of these independent snapshots will be compared by the team before importing the snapshots into the smart contracts to ensure everyone arrived at the same migration hash.
If you would like to provide your own independent verification of your snapshot results please follow these steps.
1. Create a PGP key if you don't have one already and setup gpg signing
2. Take the snapshots for both Mainchain and Sidechain either using the manual process described [here](https://github.com/HorizenOfficial/horizen-migration/blob/main/dump-scripts/python/README.md) or the automated process from the [horizen-migration-snapshot-automation](https://github.com/HorizenOfficial/horizen-migration-snapshot-automation) repository
3. Calculate the migrationhashes of the snapshot files using https://github.com/HorizenOfficial/horizen-migration/blob/main/dump-scripts/python/horizen_dump_scripts/migrationhash.py and write the hash to a file, e.g. `zend.json.migrationhash` and `eon.json.migrationhash`. [horizen-migration-snapshot-automation](https://github.com/HorizenOfficial/horizen-migration-snapshot-automation) takes care of this automatically.
4. Create detached PGP signatures of the `*.migrationhash` files e.g. by running the following:
```shell
for file in *.migrationhash; do
  gpg --detach-sign --output "${file}.asc" "${file}"
done
```
5. Fork the https://github.com/HorizenOfficial/horizen-migration repository on Github, clone it and checkout a new branch with a name of your choice
6. Create a new folder in your local fork `./snapshots/{network}/signatures/{your_name_here}`
7. Copy all `*.migrationhash` and `*.migrationhash.asc` files to `./snapshots/{network}/signatures/{your_name_here}`.

E.g.:
```
mkdir -p ~/horizen-migration/snapshots/testnet/signatures/cronic
cp *.migrationhash{,.asc} ~/horizen-migration/snapshots/testnet/signatures/cronic
```
8. Export your PGP public key and store it in the `./snapshots/{network}/signatures/{your_name_here}` folder, for example:
```shell
gpg --armor --export cronic@horizenlabs.io > ~/horizen-migration/snapshots/testnet/signatures/cronic/cronic.asc
```
9. Commit your local changes and git push your branch to Github
10. Open a Pull Request from your fork of the repository to the main branch of https://github.com/HorizenOfficial/horizen-migration

## Discrepancies
- Should you have correctly followed the manual or automated process to create the migrationhashes, but arrived at hashes different than the ones committed to this repository. Please reach out to us on the #dev-chat channel on [Discord](https://horizen.io/invite/discord), or via email to infrastructure@horizenlabs.io .
