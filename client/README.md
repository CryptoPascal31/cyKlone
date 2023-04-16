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

Select **Export transaction** in the menu.
  - The file `tx.yaml` is generated.
   Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to sign and send.

(or)

Select **Sign with chainweaver Desktop** -> Then **Submit transaction to network** in the menu.
  - The transaction signature popup will appear in Chainweaver.
  - After confirming the signature, the transaction will be submitted to the network.



Once the transaction has been submitted and successfully mined, select **Complete current deposits** in the menu. This sends the `(work)` transactions to complete the deposit.

---

## Withdrawal
*(in this mode, the recipient is sending the transaction and paying the gas => thus needs a signature)*

Select **Select pool** in the menu.
  - Choose the pool where you have deposited earlier

Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.


Select **Export transaction** in the menu.
  - The file `tx.yaml` is generated.
   Copy/Paste the content into Chainweaver's SigBuilder, or use the tool "kda-tool" to sign and send.

(or)

Select **Sign with chainweaver Desktop** -> Then **Submit transaction to network** in the menu.
  - The transaction signature popup will appear in Chainweaver.
  - After confirming the signature, the transaction will be submitted to the network.

---

## Withdrawal with relay
*(in this mode, the gas station act as a relayer and is paying the gas, but a small fee is taken from the final amount => thus doesn't need a signature)*

Select **Select pool** in the menu.
  - Choose the pool where you have deposited earlier

Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw with relay** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.
  - Enter the public key of the account. The CLI only supports single account key.

Select **Submit transaction to network** in the menu. The transaction is sent to the network.

Alternatively you can choose **Export Transaction** to generate  `tx.yaml` and send the transaction manually viva Chainweaver or 'kda-tool'.

---

## Withdrawal with relay to another chain
*(in this mode, the gas station act as a relayer and is paying the gas, but a small fee is taken from the final amount => thus doesn't need a signature)*

Select **Select pool** in the menu.
  - Choose the pool where you have deposited earlier

Select **Update local database** in the menu. This download the last version of the "on-chain Merle tree" and rebuilds it locally.

Select **Withdraw with relay X-chain** in the menu.
  - Enter the mnemonic noted during deposit
  - Enter the account where the money must be sent.
  - Check that the commitment matches with the deposit one.
  - Enter the public key of the account. The CLI only supports single account key.
  - Enter the destination chain.

Select **Submit transaction to network** in the menu. The transaction is sent to the network.

Alternatively you can choose **Export Transaction** to generate  `tx.yaml` and send the transaction manually viva Chainweaver or 'kda-tool'.

Note the *requestKey*

After the transaction is successfully mined, wait 2 minutes, and go to https://transfer.chainweb.com/xchain.html to finish the X-chain transaction.
