# Changelog

## 1.3.4
* [scripts] Added optional variables to explicitly set max fee and priority fee
* [scripts] Support for resuming a loading process after an interrupt

## 1.3.3
* [scripts] Fixed contract verification in migration scripts
* [scripts] Updated batch length for EON loading phase

## 1.3.2
* [contracts] Added additional checks for signature format in VerificationLibrary
* [scripts] Added Testnet snapshot data and signatures
* [scripts] Added mainnet migration automappings addresses from an exchange

## 1.3.1
* [scripts] Added checks of automapping addresses (checksum and network chain prefix)
* [scripts] Added testnet migration automappings test addresses from an exchange

## 1.3.0
* [scripts] Added create_restore_artifacts.sh (cumulative bash script for the creation of the restore artifacts)
* [scripts] added automappings for off-chain translation of selected addresses during the migration process

## 1.2.0
* [contracts] ZENDBackupVault: Added method claimDirectMultisig (special usecase for users that can't sign a message: requires they create a multisig UTXO in the old mainchain before the migration)

## 1.1.0
* Audit fixes
* [contracts] ZENDBackupVault: Added method claimDirect (special usecase for users that can't sign a message: requires they create a UTXO in the old mainchain before the migration)

## 1.0.0
* First version
