# cyKlone Client tool

Warning: Only beta => WIP !!

Currently, the tool is not user oriented.

## Installation
yarn install

## Run
node cyKlone_client.js

## Deposits
Select **Create Deposit transaction** in the menu.

 - Note the mnemonic
 - (Optional) Enter a password
 - Enter the account name to deposit from
 - (Optional) Note the commitment

The file `tx.yaml` is generated.
Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to sign and send.

Once the transaction has been submitted and successfully mined.

Select **Complete current deposits** in the menu. This sends the `(work)` transactions to complete the deposit.

## Withdrawal
Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.
  - Enter the gas paying account

The file `tx.yaml` is generated. It has to be signed by the gas payer.
Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to sign and send.
