// SPDX-License-Identifier: MIT
import {MODULE, RELAY_MODULE} from './pact_modules.js'
import {CyKloneTree} from './cyklone_tree.js';
import {int_to_b64, hash_dec, encode_proof} from "./codecs.js"
import {initialize as zok_init} from 'zokrates-js';
import {validateMnemonic, mnemonicToSeedSync} from 'bip39'
import {Scalar as S} from 'ffjavascript'

const P = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

class CyKlone
{
  constructor(kadena_local, resource_loader, check_roots_on_chain=true)
  {
    this.kadena_local = kadena_local;
    this.resource_loader = resource_loader;
    this.check_roots_on_chain = check_roots_on_chain;
    this.trees = {};
    this.zokrates = null;
    this.circuit_commit_hasher = null;
    this.circuit_withdraw = null;
    this.proving_key = null;
    this.already_init = false;
    this.pool = "";
  }

  async init()
  {
    if(this.already_init)
      return;

    console.log("Initializing")
    const [zok, cm, cw, pk ] = await Promise.all([zok_init(),
                                                 this.resource_loader("zkp/commitment_hasher.out").then((x) => Uint8Array.from(x)),
                                                 this.resource_loader("zkp/withdraw.out").then((x) => Uint8Array.from(x)),
                                                 this.resource_loader("zkp/proving.key").then((x) => Uint8Array.from(x))])
    console.log("Completed")
    this.zokrates = zok;
    this.circuit_commit_hasher = cm;
    this.circuit_withdraw = cw;
    this.proving_key = pk;
    this.already_init = true
  }

  get tree()
  {
    if(! (this.pool in this.trees))
      this.trees[this.pool] = new CyKloneTree(this.kadena_local, this.resource_loader, this.pool);
    return this.trees[this.pool]
  }

  /* --------------- KADENA Local Call Methods ------------------------*/
  relayer_account(account)
  {
   return this.kadena_local(`(${RELAY_MODULE}.relayer-account "${account}")`);
  }

  known_roots()
  {
   return this.kadena_local(`(at 'last-known-roots (${MODULE}.get-state "${this.pool}"))`)
                           .then((res) => res.map((x) => x.int))
  }

  is_withdrawn(nullifier_hash)
  {
   return this.kadena_local(`(${MODULE}.get-nullifier-state "${nullifier_hash}")`)
  }

  current_work()
  {
    return this.kadena_local(`(use ${MODULE})
                              (bind (get-state "${this.pool}") {'deposit-count:=deps, 'current-rank:=rank, 'merkle-tree-data:=merkle-data}
                              (- (* WORK-ROUNDS (- deps rank ))
                              (/ (at 'current-level merkle-data) COMPUTED-LEVELS-PER-ROUND)))`)
  }

  compute_deposit_data(bip39_phrase, password)
  {
    if (! validateMnemonic(bip39_phrase))
      throw new Error('Invalid Mnemonic');

    /* Obtain a 64 bytes words from the mnemonix */
    const seed = mnemonicToSeedSync(bip39_phrase, password);

    /* By pure convention, the first 32 bytes is the Secret */
    const secret = S.mod(S.fromRprBE(seed, 0, 32), P).toString();

    /* And the next 32 bytes is the nullifier */
    const nullifier = S.mod(S.fromRprBE(seed, 32, 32), P).toString();

    /* Use the commit_hasher circuit to compute the commitment. This could have
      been done in JS as well. But by using the ZoKrates circuit  we are sure that
       the commitment is 100 % compatible with the withdrawal circuit */
    const { witness, output } = this.zokrates.computeWitness(this.circuit_commit_hasher, [secret, nullifier])
    const commitment = JSON.parse(output)[0]

    return {secret:secret, nullifier:nullifier, commitment:commitment, commitment_str:int_to_b64(commitment)}
  }


  async compute_withdrawal_data(account, bip39_phrase, password)
  {
    /* Make sure that we have an up-to-date tree */
    await this.tree.load()
                   .then(()=>this.tree.update())

    /* Get the secret, nullifier and commitment from the mnemonic */
    const data = this.compute_deposit_data(bip39_phrase, password);

    data.account = account;

    /* Hash the account => This will be an input of the ZK circuit */
    data.account_hash = hash_dec(data.account);

    /* Check that the commitment is present in the tree */
    const rank = this.tree.tree.indexOf(data.commitment);
    if(rank == -1)
      throw Error("Deposit not found in the tree");

    /* Determine the merkle proof : Path + corresponding root */
    const path = this.tree.tree.proof(data.commitment)
    data.path = path.pathElements
    data.pathRoot = path.pathRoot

    /* Check that the root is present on chain */
    if(this.check_roots_on_chain)
    {
      const known_roots = await this.known_roots();
      if(! known_roots.includes(data.pathRoot))
        throw Error("Computed root not present on chain")
    }

    /* Format index word as expected by the circuit */
    data.indexWord = format_index_word(path.pathIndices)

    /* Run the circuit => to obtain the nullifier hash (Pedersen), and the root */
    const { witness, output }  = this.zokrates.computeWitness(this.circuit_withdraw, [data.account_hash, data.secret, data.nullifier, ...data.path, data.indexWord]);
    const [nullifier_hash, computed_root] = JSON.parse(output);

    /* Sanity check => Verifit that the root determined by the circuit matches
       the one computed by the JS */
    if (computed_root !== data.pathRoot)
      throw Error("Tree root does not match circuit. Your Merkle database may be corrupted")

    /* Converts the result to base64, to prepare the transaction */
    data.nullifier_hash = int_to_b64(nullifier_hash);
    data.root = int_to_b64(data.pathRoot);

    /* Once we have recomputed the nullfier, we can check weither it was already withdrawn */
    if(this.check_roots_on_chain)
    {
      if(await this.is_withdrawn(data.nullifier_hash))
        throw Error("This deposit is already withdrawn")
    }

    /* And finally compute the ZK proof */
    const proof = this.zokrates.generateProof(this.circuit_withdraw, witness, this.proving_key);
    data.proof = encode_proof(proof.proof);

    return data;
  }


  compute_withdrawal_data_with_relay(account, bip39_phrase, password)
  {
    /* In cas of relaying, we have to use the intermediate account to compute the proof */
    return this.relayer_account(account).then((x) => this.compute_withdrawal_data(x, bip39_phrase, password))
                                        .then((x) => Object.assign(x, {final_acount:account}));
  }
}

/* Utility function to compute the formatted index word expected by the circuit
   from an array of 0, ... 1 */
function format_index_word(input_array)
{
  const zeros = 32 - input_array.length;
  const extended_array = [...input_array, ...Array(zeros).fill(0)];
  const value = parseInt(extended_array.join(""),2);
  return "0x" + value.toString(16);
}

export {CyKlone}
