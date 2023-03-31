# cyKlone Client tool

Warning: Only beta => WIP !!

Currently, the tool is not user oriented.

## Installation
yarn install

## Run
node cyKlone_client.js

## Deposits
Select **Select pool** in the menu.
  - Choose the pool corresponding to the amount you want to deposit

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
Select **Select pool** in the menu.
  - Choose the pool where you have deposited earlier

Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.
  - Enter the gas paying account

The file `tx.yaml` is generated. It has to be signed by the gas payer.
Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to sign and send.


## Withdrawal with relay
Select **Select pool** in the menu.
  - Choose the pool where you have deposited earlier

Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw with relay** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.
  - Enter the public key of the account. The CLI only supports single account key.

The file `tx.yaml` is generated. Since we use the relayer contract, this is the contract who pays anonymously the gas.
The transaction doesn't need to be signed.

Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to send it (the command `kda combine-sigs` can be useful to transform the YAML transaction to JSON).
