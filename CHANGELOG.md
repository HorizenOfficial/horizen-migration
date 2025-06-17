# Changelog

## 1.3.2
* Added additional checks for signature format in VerificationLibrary
* Added Testnet snapshot data and signatures
* Added mainnet migration automappings addresses from an exchange

## 1.3.1
* Added checks of automapping addresses (checksum and network chain prefix)
* Added testnet migration automappings test addresses from an exchange

## 1.3.0
* Added create_restore_artifacts.sh (cumulative bash script for the creation of the restore artifacts)
* added automappings for off-chain translation of selected addresses during the migration process

## 1.2.0
* ZENDBackupVault: Added method claimDirectMultisig (special usecase for users that can't sign a message: requires they create a multisig UTXO in the old mainchain before the migration)

## 1.1.0
* Audit fixes
* ZENDBackupVault: Added method claimDirect (special usecase for users that can't sign a message: requires they create a UTXO in the old mainchain before the migration)

## 1.0.0
* First version
