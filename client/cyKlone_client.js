// SPDX-License-Identifier: MIT
import {CyKlone, CyKloneTransactionBuilder} from 'cyklone_js';
import {PactCommand} from '@kadena/client'
import {generateMnemonic} from 'bip39';
import { promises} from 'fs'
import inquirer from 'inquirer';
import chalk from 'chalk';
import YAML from 'yaml';

/* Kadena settings */
const CHAINWEB = "https://api.testnet.chainweb.com"
const CHAIN = 18
const NETWORK = "testnet04"
const AVAILABLE_POOLS = ["KDA_10", "KDA_100", "KDA_1000"];

const API_SERVER = `${CHAINWEB}/chainweb/0.0/${NETWORK}/chain/${CHAIN}/pact`;
const LOCAL_META = {chainId: CHAIN.toString(), gasLimit: 1000000};

async function local_pact(pact_code)
{
  const cmd = new PactCommand();
  cmd.code = pact_code;
  cmd.setMeta(LOCAL_META, NETWORK);
  const resp =  await cmd.local(API_SERVER);
  if(resp.result.status !== 'success')
  {
    console.warn(resp);
    throw Error(`Error in local call: ${pact_code}`);
  }
  return resp.result.data;
}

const local_read = (x) => promises.readFile("./"+x);

async function export_yaml_trx(cmd)
{
  const _cmd = cmd.createCommand();

  const sigdata = {cmd:_cmd.cmd,
                   hash:_cmd.hash,
                   sigs: Object.fromEntries(cmd.signers.map(  (x,i) => [x.pubKey, cmd.sigs[i] === undefined?null:cmd.sigs[i].sig]))
                  };

  await promises.writeFile("tx.yaml",YAML.stringify(sigdata, { lineWidth:0}))
  console.log("Transaction written to => " + chalk.blue("tx.yaml"))
  console.log("It can be signed/submitted by Chainweaver's SigBuilder")
  console.log("or with 'kda sign tx.yaml -k', 'kda send tx.json'")
}

const cyKlone = new CyKlone(local_pact, local_read);
const builder = new CyKloneTransactionBuilder(local_pact, NETWORK, CHAIN);


async function set_pool()
{
  const {selected_pool} = await inquirer.prompt([{type:"list", name:"selected_pool", message:"Select Pool:",
                                         choices: AVAILABLE_POOLS}])
  cyKlone.pool = selected_pool;
  builder.pool = selected_pool;
  console.log("Selected Pool: " +chalk.blue(selected_pool))
}


function update_merkle_tree()
{
  return  cyKlone.tree.load()
                      .then(() => cyKlone.tree.update())
                      .then(() => cyKlone.tree.dump())
                      .then((data) => promises.writeFile(cyKlone.tree.backup_filename, data))
}

async function gen_deposit()
{
  await cyKlone.init()
  const mnemonic = generateMnemonic()
  console.log("---------------------------- MNEMONIC -------------------------------------")
  console.log(chalk.blue(mnemonic))
  console.log("--------------------------- PLEASE NOTE IT CAREFULLY ----------------------")
  console.log("")

  const {password} = await inquirer.prompt([{type:"input", name:"password", message:"Password to protect your deposit:" }])
  return cyKlone.compute_deposit_data(mnemonic, password);
}

function generate_commitment()
{
  return gen_deposit()
         .then((deposit_data) => {console.log("Commitment: " +chalk.blue(deposit_data.commitment_str))})
}

async function create_deposit_transaction()
{
  const deposit_data = await gen_deposit()
  console.log("Commitment: " +chalk.blue(deposit_data.commitment_str))
  const {account} = await inquirer.prompt([{type:"input", name:"account", message:"Depositor account:"}])
  await builder.build_deposit(account, deposit_data).then(export_yaml_trx);
}

async function send_work()
{
  const needed_work = await cyKlone.current_work()
  if(needed_work)
  {
      console.log(`Needed work:${needed_work}`);
      for(let i=0; i<needed_work;i++)
        await builder.build_work().then( (x) => x.send(API_SERVER))
  }
  else
      console.log("The contract data is consistent => All deposits have been processed");
}

function inquire_for_withdraw()
{
  return inquirer.prompt([{type:"input", name:"mnemonic", message:"Deposit's Mnemonic:"},
                          {type:"input", name:"password", message:"Password to protect your deposit:" },
                          {type:"input", name:"account", message:"Recipient's account:" }])
}

function generate_proof()
{
  return cyKlone.init()
         .then(inquire_for_withdraw)
         .then((x) => cyKlone.compute_withdrawal_data(x.account, x.mnemonic, x.password))
         .then((data) => {console.log(chalk.green("Account: ") + data.account);
                          console.log(chalk.green("Commitment: ") + data.commitment_str);
                          console.log(chalk.green("Nullifier Hash: ") + data.nullifier_hash);
                          console.log(chalk.green("Root: ") + data.root);
                          console.log(chalk.green("Proof: ") + data.proof);});
}

function create_withdrawal_transaction()
{
  return cyKlone.init()
         .then(inquire_for_withdraw)
         .then((x) => cyKlone.compute_withdrawal_data(x.account, x.mnemonic, x.password))
         .then((data) => builder.build_withdrawal(data.account, data))
         .then(export_yaml_trx);
}

async function create_withdrawal_relayer_transaction()
{
  const data = await cyKlone.init()
                     .then(inquire_for_withdraw)
                     .then((x) => cyKlone.compute_withdrawal_data_with_relay(x.account, x.mnemonic, x.password))

  await inquirer.prompt({type:"input", name:"account_key", message:"Acccount Key (single 'keys-all'):" })
                .then((x) => builder.build_withdrawal_with_relay(data.final_acount, x.account_key, data))
                .then(export_yaml_trx);
}


async function main_menu()
{
  const EXIT = "Exit";
  const SELECT_POOL = "Select pool"
  const UPDATE_LOCAL_DB = "Update local database";
  const GENERATE_COMMITMENT = "Generate commitment";
  const DEPOSIT = "Create Deposit transaction";
  const COMPLETE_RUNNING_DEPOSITS = "Complete current deposits";
  const GENERATE_PROOF = "Generate proof";
  const WITHDRAW ="Withdraw";
  const WITHDRAW_RELAY ="Withdraw with relay";

  while(true)
  {
    console.log("")
    const answer = await inquirer.prompt([{type:"list", name:"menu_item", message:"Menu:",
                                           choices: [SELECT_POOL,
                                                     UPDATE_LOCAL_DB,
                                                     DEPOSIT,
                                                     GENERATE_COMMITMENT,
                                                     COMPLETE_RUNNING_DEPOSITS,
                                                     "Deposit status",
                                                     GENERATE_PROOF,
                                                     WITHDRAW,
                                                     WITHDRAW_RELAY,
                                                     EXIT]}])
    if(answer.menu_item === EXIT)
      break;
    try
    {
      switch(answer.menu_item)
      {
        case SELECT_POOL:
          await set_pool();
          break;
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
        case WITHDRAW_RELAY:
          await create_withdrawal_relayer_transaction()
          break;
      }
    }
    catch (error)
    {
      console.error(chalk.red(error));
    }
  }
}



async function main()
{
  /* Set default pool */
  cyKlone.pool = AVAILABLE_POOLS[0];
  builder.pool = AVAILABLE_POOLS[0];
  await main_menu();
}

main()
