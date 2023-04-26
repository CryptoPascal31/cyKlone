// SPDX-License-Identifier: MIT
import {PactNumber} from '@kadena/pactjs'
import {PactCommand} from '@kadena/client'
import {genKeyPair, signHash} from '@kadena/cryptography-utils'
import {MODULE, RELAY_MODULE, WORK_GAS_STATION} from './pact_modules.js'

const PACT_ZERO = new PactNumber(0.0)


class CyKloneTransactionBuilder
{
  constructor(kadena_local, network="mainnet01", chain=1)
  {
    this.kadena_local = kadena_local;
    this.network = network;
    this.chain = chain.toString()
    this.pool = "";
  }

  deposit_paramaters()
  {
    return this.kadena_local(`(use ${MODULE})
                              {'amount:(+ (at 'deposit-amount (get-state "${this.pool}")) FEES),
                               'reserve:RESERVE}`);
  }

  get_account_key(account)
  {
    return this.kadena_local(`(at 'guard (coin.details "${account}"))`)
           .then((data) => data?.keys[0])
  }

  get_relay_parameters(account)
  {
    return this.kadena_local(`(use ${RELAY_MODULE})
                              {'gas_payer:(gas-payer-account),
                               'gas_price:GAS-PRICE-MAX,
                               'gas_limit:GAS-LIMIT-MAX}`);
  }

  get_work_gas_parameters(account)
  {
    return this.kadena_local(`(use ${WORK_GAS_STATION})
                              {'gas_payer:(gas-payer-account),
                               'gas_price:GAS-PRICE,
                               'gas_limit:GAS-LIMIT}`);
  }

  async build_deposit(account, deposit_data)
  {
    const cmd = new PactCommand();
    const account_key = await this.get_account_key(account);
    if(! account_key)
      throw Error("Unsupported account")

    const {amount, reserve} = await this.deposit_paramaters();
    const pact_amount = new PactNumber(amount)

    cmd.code = `(${MODULE}.deposit (read-string 'depositor) (read-string 'commitment))`
    cmd.setMeta({sender:account, chainId: this.chain, gasLimit: 3500}, this.network);
    cmd.addData({pool:this.pool,
                 depositor:account,
                 commitment:deposit_data.commitment_str})
    cmd.addCap('coin.TRANSFER', account_key, account, reserve, pact_amount.toPactDecimal())
    cmd.addCap('coin.GAS', account_key)
    return cmd
  }

  async build_withdrawal(gas_payer, withdrawal_data)
  {
    const cmd = new PactCommand();
    const gas_payer_key = await this.get_account_key(gas_payer);

    cmd.code = `(${MODULE}.withdraw "${withdrawal_data.account}" (read-string 'nullifier) (read-string 'root) (read-string 'proof))`;

    cmd.setMeta({sender:gas_payer, chainId: this.chain, gasLimit: 35000}, this.network);
    cmd.addData({pool:this.pool,
                 nullifier:withdrawal_data.nullifier_hash,
                 root:withdrawal_data.root,
                 proof:withdrawal_data.proof});
    cmd.addCap('coin.GAS', gas_payer_key);
    return cmd;
  }

  async build_withdrawal_with_relay(final_account, final_account_key, withdrawal_data, target_chain=null)
  {
    const cmd = new PactCommand();
    const {gas_payer, gas_price, gas_limit}  = await this.get_relay_parameters()
    /* A gas station should trigger the GAS_PAYER cap, and thus need a signature.
      Just create a random key to sign the capability */
    const tmp_key = genKeyPair();

    let keyset = null;
    if(typeof final_account_key == 'object')
      keyset = final_account_key;
    else if(/^\w{64}$/.test(final_account_key))
      keyset = {pred:"keys-all", keys:[final_account_key]};
    else
      throw Error("Unsupported key/keyset");

    if(target_chain)
      cmd.code = `(${RELAY_MODULE}.relay-withdraw-xchain (read-string 'receiver) (read-keyset 'receiver_keyset) "${target_chain}" (read-string 'nullifier) (read-string 'root) (read-string 'proof))`
    else
      cmd.code = `(${RELAY_MODULE}.relay-withdraw-create (read-string 'receiver) (read-keyset 'receiver_keyset) (read-string 'nullifier) (read-string 'root) (read-string 'proof))`
    cmd.setMeta({sender:gas_payer, chainId: this.chain, gasLimit: gas_limit, gasPrice:gas_price}, this.network);
    cmd.addData({receiver:final_account,
                 receiver_keyset:keyset,
                 pool:this.pool,
                 nullifier:withdrawal_data.nullifier_hash,
                 root:withdrawal_data.root,
                 proof:withdrawal_data.proof })

    cmd.addCap(`${RELAY_MODULE}.GAS_PAYER`, tmp_key.publicKey, "", PACT_ZERO.toPactInteger(), PACT_ZERO.toPactDecimal())

    const {hash} = cmd.createCommand()
    cmd.addSignatures(signHash(hash, tmp_key))
    return cmd
  }

  async build_work()
  {
    const cmd = new PactCommand();
    /* A gas station should trigger the GAS_PAYER cap, and thus need a signature.
      Just create a random key to sign the capability */
    const {gas_payer, gas_price, gas_limit}  = await this.get_work_gas_parameters()
    const tmp_key = genKeyPair();

    cmd.code = `(${MODULE}.work)`
    cmd.setMeta({ttl:600, sender:gas_payer, chainId: this.chain, gasLimit: gas_limit, gasPrice:gas_price}, this.network);
    cmd.addCap(`${WORK_GAS_STATION}.GAS_PAYER`, tmp_key.publicKey, "", PACT_ZERO.toPactInteger(), PACT_ZERO.toPactDecimal())
    cmd.addData({pool:this.pool})
    const {hash} = cmd.createCommand()
    cmd.addSignatures(signHash(hash, tmp_key))
    return cmd
  }
}

export {CyKloneTransactionBuilder}
