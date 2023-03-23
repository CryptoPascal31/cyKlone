const circomlibjs = require("circomlibjs");
const ffjavascript = require("ffjavascript");
const fs = require("fs");
const fixed_merkle_tree = require("fixed-merkle-tree");
const bip39 = require("bip39");
const crypto_utils = require('@kadena/cryptography-utils');
const S = ffjavascript.Scalar;
const inquirer = require('inquirer');
const kda_client = require('@kadena/client');
const pactjs = require('@kadena/pactjs');
const chalk = require('chalk')
const YAML = require('yaml')

const P = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

/* Kadena settings */
const CHAINWEB = "https://api.testnet.chainweb.com"
const CHAIN = 18
const NETWORK = "testnet04"
const MODULE = "free.cyKlone-v0-10"

const WORK_GAS_STATION = "free.cyKlone-work-gas-station"

const DEPOSIT_AMOUNT = 10.0

const API_SERVER = `${CHAINWEB}/chainweb/0.0/${NETWORK}/chain/${CHAIN}/pact`;
const LOCAL_META = {chainId: CHAIN.toString(), gasLimit: 1000000};


function int_to_b64(x)
{
  buffer = new Uint8Array(32)
  S.toRprBE(buffer, 0, S.e(x), 32)
  return crypto_utils.base64UrlEncodeArr(buffer)
}

function b64_to_dec(x)
{
  buffer = crypto_utils.base64UrlDecodeArr(x);
  return S.fromRprBE(buffer,0).toString();
}

function hash_dec(x)
{
  buffer = crypto_utils.hashBin(x);
  return S.mod(S.fromRprBE(buffer,0),P).toString();
}

function encode_proof(proof)
{
  const proof_tab = [...proof.a, ...proof.b[0], ...proof.b[1], ...proof.c];
  return proof_tab.map(int_to_b64).join("");

}



var circuit_withdraw;
var circuit_commit_hasher;
var zokrates;
var proving_key;
var merkle_tree;

async function init()
{
  console.log("Initializing ZoKrates");
  _zokrates = await import("zokrates-js");
  zokrates = await _zokrates.initialize();

  console.log("Loading circuits");
  circuit_commit_hasher = Uint8Array.from(fs.readFileSync("./zkp/commitment_hasher.out"))
  circuit_withdraw = Uint8Array.from(fs.readFileSync("./zkp/withdraw.out"))

  console.log("Loading keys");
  proving_key = Uint8Array.from(fs.readFileSync("./zkp/proving.key"))

  console.log("Loading Merkle Tree")
  await load_merkle_tree()

}

async function load_merkle_tree()
{
  const poseidon = await circomlibjs.buildPoseidonReference();
  const F = poseidon.F;
  const hashfn = (l, r) => {return F.toString(poseidon([l,r]),10) }
  try
  {
    const data = JSON.parse(fs.readFileSync("merkle_tree.json"))
    merkle_tree = fixed_merkle_tree.MerkleTree.deserialize(data, hashfn)
    console.log(`Merkle tree size: ${merkle_tree.elements.length}`)
  }
  catch (error) {
    console.log("Merkle tree DB doesn't exist => Create")
    const ZERO = "8355858611563045677440680357889341193906656246723581940305640971585549179022";
    merkle_tree = new fixed_merkle_tree.MerkleTree(18, [],  {hashFunction:hashfn, zeroElement:ZERO});
    save_merkle_tree()
  }
}



function save_merkle_tree()
{
  fs.writeFileSync("merkle_tree.json", JSON.stringify(merkle_tree.serialize()) )
}

async function update_merkle_tree()
{
  const rank = await get_current_rank()
  let tree_size = merkle_tree.elements.length
  if(tree_size === rank)
  {
    console.log("Merkle_tree up to date")
    return
  }

  console.log(`Updating merkle tree ${tree_size} => ${rank}`)

  while(tree_size < rank)
  {
    let chunk = await get_deposit_chunk(merkle_tree.elements.length)
    console.log(`Updating Progress ${tree_size} => ${tree_size + chunk.length}`)
    merkle_tree.bulkInsert(chunk.map(b64_to_dec))
    tree_size = merkle_tree.elements.length
  }
  console.log("Update complete")
  save_merkle_tree()
}



async function local_pact(pact_code)
{
  const cmd = new kda_client.PactCommand();
  cmd.code = pact_code;
  cmd.setMeta(LOCAL_META, NETWORK);
  const resp =  await cmd.local(API_SERVER);
  if(resp.result.status !== 'success')
  {
    console.warn(resp)
      throw Error(`Error in local call: ${pact_code}`)
  }
  return resp.result.data;
}

async function get_account_key(account)
{
  const data = await local_pact(`(coin.details "${account}")`);

  if(! 'keys' in data.guard)
    throw Error("Unsopported account");
  return data.guard.keys[0]
}

async function get_deposit_paramaters()
{
  return await local_pact(`(use ${MODULE}){'amount:DENOMINATION, 'reserve:RESERVE}`)
}

async function generate_deposit_trx(account, deposit_data)
{
  const cmd = new kda_client.PactCommand();
  const account_key = await get_account_key(account);
  const {amount, reserve} = await get_deposit_paramaters();
  const amount_number = new pactjs.PactNumber(amount)

  cmd.code = `(${MODULE}.deposit "${account}" "${deposit_data.commitment_str}")`
  cmd.setMeta({sender:account, chainId: CHAIN.toString(), gasLimit: 3500}, NETWORK);
  cmd.addCap('coin.TRANSFER', account_key, account, reserve, amount_number.toPactDecimal())
  cmd.addCap('coin.GAS', account_key)

  console.log(cmd)
  return cmd
}

async function generate_withdrawal_trx(data, gas_payer)
{
  const cmd = new kda_client.PactCommand();
  const gas_payer_key = await get_account_key(gas_payer);

  cmd.code = `(${MODULE}.withdraw "${data.account}" "${data.nullifier_hash}" "${data.root}" "${data.proof}")`
  cmd.setMeta({sender:gas_payer, chainId: CHAIN.toString(), gasLimit: 35000}, NETWORK);
  cmd.addCap('coin.GAS', gas_payer_key)

  return cmd
}

async function send_work()
{
  const zero = new pactjs.PactNumber(0.0);
  const state = await get_state();
  const gas_payer = await local_pact(`(${WORK_GAS_STATION}.gas-payer-account)`);
  const needed_work = 6*(state['deposit-count'].int -  state['current-rank'].int);

  if(needed_work === 0)
  {
    console.log("The contract data is consistent => All deposits have been processed");
    return;
  }
  console.log(`Needed work:${needed_work}`)

  for(i=0;i<needed_work; i++)
  {
    const tmp_key = crypto_utils.genKeyPair();
    const cmd = new kda_client.PactCommand();
    cmd.setMeta({sender:gas_payer, chainId: CHAIN.toString(), gasLimit: 120000, gasPrice:0.00000001}, NETWORK);
    cmd.code = `(${MODULE}.work)`
    cmd.addCap(`${WORK_GAS_STATION}.GAS_PAYER`, tmp_key.publicKey, "", zero.toPactInteger(), zero.toPactDecimal())

    const {hash} = cmd.createCommand()
    cmd.addSignatures(crypto_utils.signHash(hash, tmp_key))
    await cmd.send(API_SERVER)
  }
  console.log("Work transactions have been sent. Please wait 3-4 minutes");
}

function export_yaml_trx(cmd)
{
  let _cmd = cmd.createCommand();

  let sigdata = {cmd:_cmd.cmd,
                 hash:_cmd.hash,
                 sigs: Object.fromEntries(cmd.signers.map( (x) => [x.pubKey, null]))
               };


  fs.writeFileSync("tx.yaml",YAML.stringify(sigdata, { lineWidth:0}));
  console.log("Transaction written to => " + chalk.blue("tx.yaml"))
  console.log("It can be signed/submitted by Chainweaver's SigBuilder")
  console.log("or with 'kda sign tx.yaml -k', 'kda send tx.json'")
}



/* Kadena Functions */

async function get_state()
{
  let cmd = new kda_client.PactCommand();
  cmd.code = `(${MODULE}.get-state)`;
  cmd.setMeta(LOCAL_META, NETWORK);
  resp =  await cmd.local(API_SERVER);
  if(resp.result.status === 'success')
    return resp.result.data
  else
    throw Error("Error when requesting on-chain state")
}

async function get_last_roots()
{
  state = await get_state()
  return state['last-known-roots'].map( (x)=>x.int)
}

async function get_current_rank()
{
  state = await get_state()
  return state['current-rank'].int
}

async function get_deposit_chunk(start)
{
  const end = start + 100
  const cmd = new kda_client.PactCommand();
  cmd.code = `(${MODULE}.get-deposits-range ${start} ${end})`;
  console.log(cmd.code)
  cmd.setMeta(LOCAL_META, NETWORK);
  resp =  await cmd.local(API_SERVER);
  if(resp.result.status === 'success')
    return resp.result.data
  else
    console.warn(resp)
    throw Error("Error when requesting on-chain state")
}

function hash_commitment(secret, nullifier) {
  const { witness, output }  = zokrates.computeWitness(circuit_commit_hasher, [secret, nullifier])
  return JSON.parse(output)[0]
}


function compute_deposit_data(bip39_phrase, password)
{
  if (! bip39.validateMnemonic(bip39_phrase))
    throw new Error('Invalid Mnemonic');
  const seed = bip39.mnemonicToSeedSync(bip39_phrase, password);
  const secret = S.mod(S.fromRprBE(seed, 0,32),P).toString();
  const nullifier = S.mod(S.fromRprBE(seed, 32,32),P).toString();
  let commitment = hash_commitment(secret, nullifier);

  return {secret:secret, nullifier:nullifier, commitment:commitment,
          commitment_str:int_to_b64(commitment)}
}

async function create_deposit_data()
{
  const mnemonic = bip39.generateMnemonic()
  console.log("--------------- MNEMONIC ----------------------")
  console.log(chalk.blue(mnemonic))
  console.log("----------------PLEASE NOTE IT ----------------")
  console.log("")

  let answer  = await inquirer.prompt([{type:"input", name:"password", message:"Password to protect your deposit:" }])
  return compute_deposit_data(mnemonic, "")
}

async function generate_commitment()
{
  deposit_data = await create_deposit_data()
  console.log(chalk.green("Commitment: ") + deposit_data.commitment_str)
}

async function generate_proof()
{
  data = await compute_withdrawal_data()
  console.log(chalk.green("Commitment: ") + data.commitment_str)
  console.log(chalk.green("Nullifier Hash: ") + data.nullifier_hash)
  console.log(chalk.green("Root: ") + data.root)
  console.log(chalk.green("Proof: ") + data.proof)
}

async function create_deposit_transaction()
{
  const deposit_data = await create_deposit_data()
  const {account,}  = await inquirer.prompt([{type:"input", name:"account", message:"Depositor account:" }])

  console.log("---------------------------------------------------------")
  console.log("---------------------------------------------------------")

  console.log(chalk.green("Commitment: ") + deposit_data.commitment_str)

  console.log( chalk.green("Pact code: ") + `(${MODULE}.deposit "${account}" "${deposit_data.commitment_str}")`)

  cmd = await generate_deposit_trx(account, deposit_data )
  export_yaml_trx(cmd);


}


function compute_index_word(input_array)
{
  zeros = 32 - input_array.length;
  const extended_array = [...input_array, ...Array(zeros).fill(0)];
  value = parseInt(extended_array.join(""),2);
  return "0x" + value.toString(16);
}



async function compute_withdrawal_data()
{
  let answer  = await inquirer.prompt([{type:"input", name:"mnemonic", message:"Deposit's Mnemonic"},
                                       {type:"input", name:"password", message:"Password to protect your deposit:" },
                                       {type:"input", name:"account", message:"Acccount:" }]);

  data = await compute_deposit_data(answer.mnemonic, answer.password);
  data.account = answer.account
  data.account_hash = hash_dec(data.account)

  console.log(chalk.green("Commitment: ") + data.commitment_str)

  const rank = merkle_tree.indexOf(data.commitment)

  if(rank == -1)
    throw Error("Deposit not found in the tree")

  const path = merkle_tree.proof(data.commitment)

  data.path = path.pathElements
  data.pathRoot = path.pathRoot

  const known_roots = await get_last_roots()
  if(! known_roots.includes(data.pathRoot))
    throw Error("Computed root not present on chain")

  data.indexWord = compute_index_word(path.pathIndices)

  const { witness, output }  = zokrates.computeWitness(circuit_withdraw, [data.account_hash, data.secret, data.nullifier, ...data.path, data.indexWord]);
  const [nullifier_hash, computed_root] = JSON.parse(output);

  if (computed_root !== data.pathRoot)
    throw Error("Tree root does not match circuit. Your database may be corrupted")

  data.nullifier_hash = int_to_b64(nullifier_hash);
  data.root = int_to_b64(data.pathRoot);
  console.log("Generating proof");

  const proof = zokrates.generateProof(circuit_withdraw, witness, proving_key);
  data.proof = encode_proof(proof.proof);
  return data;
}



async function create_withdrawal_transaction()
{
  data = await compute_withdrawal_data()
  console.log(chalk.green("Nullifier Hash: ") + data.nullifier_hash)
  console.log(chalk.green("Root: ") + data.root)
  console.log(chalk.green("Proof: ") + data.proof)
  const {gas_payer,}  = await inquirer.prompt([{type:"input", name:"gas_payer", message:"Gas payer:" }])

  const trx = await generate_withdrawal_trx(data, gas_payer)
  export_yaml_trx(trx);
}


async function main_menu()
{
  const EXIT = "Exit";
  const UPDATE_LOCAL_DB = "Update local database";
  const GENERATE_COMMITMENT = "Generate commitment";
  const DEPOSIT = "Create Deposit transaction";
  const COMPLETE_RUNNING_DEPOSITS = "Complete current deposits";
  const GENERATE_PROOF = "Generate proof";
  const WITHDRAW ="Withdraw";

  while(true)
  {
    console.log("")
    answer = await inquirer.prompt([{type:"list", name:"menu_item", message:"Menu:",
                                     choices: [UPDATE_LOCAL_DB,
                                               DEPOSIT,
                                               GENERATE_COMMITMENT,
                                               COMPLETE_RUNNING_DEPOSITS,
                                               "Deposit status",
                                               GENERATE_PROOF,
                                               WITHDRAW,
                                               EXIT]}])
    if(answer.menu_item === EXIT)
      break;
    switch(answer.menu_item)
    {
      case UPDATE_LOCAL_DB:
        await update_merkle_tree();
        break;
      case DEPOSIT:
        await create_deposit_transaction();
        break;
      case GENERATE_COMMITMENT:
        await generate_commitment();
        break;
      case COMPLETE_RUNNING_DEPOSITS:
        await send_work();
        break;
      case GENERATE_PROOF:
        await generate_proof();
        break;
      case WITHDRAW:
        await create_withdrawal_transaction();
        break;


    }

  }
}



async function main()
{
  await init();


  //await update_merkle_tree()
  await main_menu();


  //x = await create_deposit_data()
  //console.log(x)
  //x = await create_withdrawal_data()
  //console.log(x)
  //t = await get_merkle_tree()
  //tree_size = t.elements.length

  //merkle_tree.bulkInsert(["HeEGL8v_r6LY_GAgyt92WOyM_ETivNDcBMckxEO05W0", "F7YrjTInreRID-_59JyBT6a2FPFXuqZlozI_o7D7uDY", "KGPytNCSi1JSWJdlXqdOVrAv4fTe-hAa5PGNmXmatrU", "BQyIswNTD5OaMAbIqF5JhYw8gGgY5YfB363A8_zuzts"].map(b64_to_dec));
  //save_merkle_tree()
  //t.insert(b64_to_dec("HeEGL8v_r6LY_GAgyt92WOyM_ETivNDcBMckxEO05W0"))
  //console.log(`Merkle tree size:${t.elements.length}`)
  //console.log(`Merkle tree root:${t.root}`)


  //save_merkle_tree(t)
//  tree = await get_merkle_tree()
//
//  tree.insert(element)
//  console.log(tree.root)
//
//  tree.insert(element_2)
//  console.log(tree.root)
//
//  tree.insert(element_3)
//  console.log(tree.root)

}

main()
