// SPDX-License-Identifier: MIT
import {PactNumber} from '@kadena/pactjs'
import {PactCommand} from '@kadena/client'
import {genKeyPair, signHash} from '@kadena/cryptography-utils'

const PACT_ZERO = new PactNumber(0.0)
const MODULE = "free.cyKlone-v0-10"
const RELAY_MODULE = "free.cyKlone-relay-v0"
const WORK_GAS_STATION = "free.cyKlone-work-gas-station"

class CyKloneTransactionBuilder
{
  constructor(kadena_local, network="mainnet01", chain=1)
  {
    this.kadena_local = kadena_local;
    this.network = network;
    this.chain = chain.toString()
  }

  deposit_paramaters()
  {
    return this.kadena_local(`(use ${MODULE}){'amount:DENOMINATION, 'reserve:RESERVE}`)
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

    cmd.code = `(${MODULE}.deposit "${account}" "${deposit_data.commitment_str}")`
    cmd.setMeta({sender:account, chainId: this.chain, gasLimit: 3500}, this.network);
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
    cmd.addData({nullifier:withdrawal_data.nullifier_hash,
                 root:withdrawal_data.root,
                 proof:withdrawal_data.proof});
    cmd.addCap('coin.GAS', gas_payer_key);
    return cmd;
  }

  async build_withdrawal_with_relay(final_account, final_account_key, withdrawal_data)
  {
    const cmd = new PactCommand();
    const {gas_payer, gas_price, gas_limit}  = await this.get_relay_parameters()
    /* A gas station should trigger the GAS_PAYER cap, and thus need a signature.
      Just create a random key to sign the capability */
    const tmp_key = genKeyPair();

    cmd.code = `(${RELAY_MODULE}.withdraw-create-relay "${final_account}" (read-keyset 'ks) (read-string 'nullifier) (read-string 'root) (read-string 'proof))`
    cmd.setMeta({sender:gas_payer, chainId: this.chain, gasLimit: gas_limit, gasPrice:gas_price}, this.network);
    cmd.addData({ks:{pred:"keys-all", keys:[final_account_key]},
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
    cmd.setMeta({sender:gas_payer, chainId: this.chain, gasLimit: gas_limit, gasPrice:gas_price}, this.network);
    cmd.addCap(`${WORK_GAS_STATION}.GAS_PAYER`, tmp_key.publicKey, "", PACT_ZERO.toPactInteger(), PACT_ZERO.toPactDecimal())

    const {hash} = cmd.createCommand()
    cmd.addSignatures(signHash(hash, tmp_key))
    return cmd
  }
}

export {CyKloneTransactionBuilder}
