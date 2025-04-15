module.exports = {
  printReceipt: function (name, receipt) {
    console.log(">>>> " + name);
    const gasUsed = receipt.gasUsed; // Gas units consumed
    const gasPrice = receipt.gasPrice; // Gas price in wei per unit
    const totalGasCost = gasUsed * gasPrice; // Total cost in wei
    console.log(`Tx hash: ${receipt.hash}`);
    console.log(`Gas Used: ${gasUsed}`);
    console.log(`Gas Price: ${gasPrice}`);
    console.log(`Total Gas Cost: ${ethers.formatEther(totalGasCost)} ETH`);
  },

  EON_VAULT_CONTRACT_NAME: "EONBackupVault",
  ZEND_VAULT_CONTRACT_NAME: "ZendBackupVault",
  ZEN_TOKEN_CONTRACT_NAME: "ZenToken",

};