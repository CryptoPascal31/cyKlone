// SPDX-License-Identifier: MIT
import {CyKlone, CyKloneTransactionBuilder} from 'cyklone_js';
import {PactCommand, signWithChainweaver} from '@kadena/client'
import {generateMnemonic, validateMnemonic} from 'bip39';
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

async function local_check(cmd)
{
  const resp =  await cmd.local(API_SERVER);
  if(resp.result.status !== 'success')
  {
    console.warn(resp);
    throw Error(`Error in local call: ${cmd.code}`);
  }
  return resp.result.data;
}

function local_pact(pact_code)
{
  const cmd = new PactCommand();
  cmd.code = pact_code;
  cmd.setMeta(LOCAL_META, NETWORK);
  return local_check(cmd)
}

const local_read = (x) => promises.readFile("./"+x);

async function export_yaml_trx(cmd)
{
  const _cmd = cmd.createCommand();

  const sigdata = {cmd:_cmd.cmd,
                   hash:_cmd.hash,
                   sigs: Object.fromEntries(cmd.signers.map(  (x,i) => [x.pubKey, cmd.sigs[i] === undefined?null:cmd.sigs[i].sig]))
                  };

  const trx_string = YAML.stringify(sigdata, { lineWidth:0})
  console.log(chalk.magenta("------------------------------------------------------------------"));
  console.log(trx_string.trim())
  console.log(chalk.magenta("------------------------------------------------------------------"));
  await promises.writeFile("tx.yaml",trx_string)
  console.log("Transaction written to => " + chalk.blue("tx.yaml"))
  console.log("It can be signed/submitted by Chainweaver's SigBuilder")
  console.log("or with 'kda sign tx.yaml -k', 'kda send tx.json'")
}

async function export_or_send(cmd)
{
  const EXPORT_TRANSACTION = "Export transaction";
  const SEND_TRANSACTION = "Submit transaction to network";
  console.log("");
  const answer = await inquirer.prompt([{type:"list", name:"trx_item", message:"What to do now:",
                                         choices: [EXPORT_TRANSACTION, SEND_TRANSACTION]}]);
  if(answer.trx_item === EXPORT_TRANSACTION)
    return await export_yaml_trx(cmd);
  else
    return await local_check(cmd)
                 .then(() => cmd.send(API_SERVER))
                 .then(() => console.log(`Request Key: ${cmd.requestKey}`))
                 .then(() => cmd.pollUntil(API_SERVER))
                 .then((x) => console.log(`Transaction status: ${x.status}`));
}

async function export_or_sign(cmd)
{
   const EXPORT_TRANSACTION = "Export transaction";
   const SIGN = "Sign with chainweaver";
   console.log("");
   const answer = await inquirer.prompt([{type:"list", name:"trx_item", message:"What to do now:",
                                          choices: [EXPORT_TRANSACTION, SIGN]}]);
   if(answer.trx_item === EXPORT_TRANSACTION)
     return await export_yaml_trx(cmd);
   else
     return await signWithChainweaver(cmd)
                  .then((x) => export_or_send(x[0]));
}

const cyKlone = new CyKlone(local_pact, local_read);
const builder = new CyKloneTransactionBuilder(local_pact, NETWORK, CHAIN);


function print_pool_data(long_print=false)
{
  return cyKlone.pool_data()
                .then((data) => {
                  console.log(chalk.magenta("--------------------------------------------"));
                  console.log("Selected Pool: " + chalk.blue(data.pool_name));
                  console.log("Deposit amount: " +chalk.blue(data.deposit_amount.toFixed(2)));
                  console.log("Deposit Fees: " +chalk.blue(data.deposit_fees));
                  if(long_print)
                  {
                    console.log("Total deposits: " +chalk.blue(data.total_deposits));
                    console.log("Processed deposits: " +chalk.blue(data.processed_deposits));
                    console.log("Queued deposits: " +chalk.blue(data.queued_deposits));
                    console.log("Current deposit processing: " +chalk.blue(data.deposit_progress));
                    console.log("Total withdrawals: " +chalk.blue(data.withdrawals));
                    console.log("Last work block: " + chalk.blue(data.last_work))
                  }
                  console.log(chalk.magenta("--------------------------------------------"));})
}

function set_pool()
{
  return inquirer.prompt([{type:"list", name:"selected_pool", message:"Select Pool:",
                           choices: AVAILABLE_POOLS}])
                 .then((resp) => { cyKlone.pool = resp.selected_pool;
                                   builder.pool = resp.selected_pool;})
                 .then(print_pool_data)
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
  return await cyKlone.compute_deposit_data(mnemonic, password);
}

function print_commitment(data)
{
  console.log("Commitment: " +chalk.blue(data.commitment_str) + ` (${data.commitment})`)
  return data
}

function generate_commitment()
{
  return gen_deposit()
         .then(print_commitment)
}

async function get_deposit_state()
{
  const {input} = await inquirer.prompt([{type:"input", name:"input", message:"Deposit's Mnemonic or Commitment:"}])

  let status;

  if(validateMnemonic(input))
    status = await cyKlone.init()
                   .then(() => inquirer.prompt([{type:"input", name:"password", message:"Password to protect your deposit:" }]))
                   .then((r) => cyKlone.compute_deposit_data(input, r.password))
                   .then(print_commitment)
                   .then((data) => cyKlone.deposit_state(data.commitment_str))
  else if(input.length == 43)
    status = await cyKlone.deposit_state(input);
  else
    throw Error("Not a mnemonic nor a commitment")

  console.log("Status:" + chalk.blue(status))
}

async function create_deposit_transaction()
{
  const deposit_data = await gen_deposit()
                       .then(print_commitment)
  const {account} = await inquirer.prompt([{type:"input", name:"account", message:"Depositor account:"}])
  await builder.build_deposit(account, deposit_data)
        .then(export_or_sign);
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

function inquire_key(x)
{
  return inquirer.prompt([{type:"input", name:"account_key", message:"Acccount Key (single 'keys-all'):"}],x)
}

function inquire_chain(x)
{
  return inquirer.prompt([{type:"input", name:"target_chain", message:"Target Chain:" }],x)
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
         .then(export_or_sign);
}

async function create_withdrawal_relayer_transaction()
{
  const in_data =  await cyKlone.init()
                                .then(inquire_for_withdraw)
                                .then(inquire_key)
  return cyKlone.compute_withdrawal_data_with_relay(in_data.account, in_data.mnemonic, in_data.password)
                .then((data) => builder.build_withdrawal_with_relay(data, in_data.account_key))
                .then(export_or_send);
}

async function create_withdrawal_x_chain_relayer_transaction()
{
  const in_data =  await cyKlone.init()
                                .then(inquire_for_withdraw)
                                .then(inquire_key)
                                .then(inquire_chain)
  return cyKlone.compute_withdrawal_data_with_relay_xchain(in_data.account, in_data.target_chain, in_data.mnemonic, in_data.password)
                .then((data) => builder.build_withdrawal_with_relay(data, in_data.account_key))
                .then(export_or_send);
}


async function main_menu()
{
  const EXIT = "Exit";
  const SELECT_POOL = "Select pool";
  const PRINT_POOL_DATA = "Show pool data";
  const UPDATE_LOCAL_DB = "Update local database";
  const GENERATE_COMMITMENT = "Generate commitment";
  const DEPOSIT = "Create Deposit transaction";
  const DEPOSIT_STATUS = "Show deposit status";
  const COMPLETE_RUNNING_DEPOSITS = "Complete current deposits";
  const GENERATE_PROOF = "Generate proof";
  const WITHDRAW ="Withdraw";
  const WITHDRAW_RELAY ="Withdraw with relay";
  const WITHDRAW_RELAY_XCHAIN ="Withdraw with relay X-chain";
  const DEPLOYED_MODULES_INFOS ="Deployed modules infos"

  while(true)
  {
    console.log("")
    const answer = await inquirer.prompt([{type:"list", name:"menu_item", message:"Menu:",
                                           choices: [SELECT_POOL,
                                                     PRINT_POOL_DATA,
                                                     UPDATE_LOCAL_DB,
                                                     DEPOSIT,
                                                     GENERATE_COMMITMENT,
                                                     COMPLETE_RUNNING_DEPOSITS,
                                                     DEPOSIT_STATUS,
                                                     GENERATE_PROOF,
                                                     WITHDRAW,
                                                     WITHDRAW_RELAY,
                                                     WITHDRAW_RELAY_XCHAIN,
                                                     DEPLOYED_MODULES_INFOS,
                                                     EXIT]}])
    if(answer.menu_item === EXIT)
      break;
    try
    {
      switch(answer.menu_item)
      {
        case DEPLOYED_MODULES_INFOS:
          await cyKlone.module_infos().then(console.log);
          break;
        case SELECT_POOL:
          await set_pool();
          break;
        case PRINT_POOL_DATA:
          await print_pool_data(true);
          break;
        case UPDATE_LOCAL_DB:
          await update_merkle_tree();
          break;
        case DEPOSIT:
          await create_deposit_transaction();
          break;
        case DEPOSIT_STATUS:
          await get_deposit_state();
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
        case WITHDRAW_RELAY_XCHAIN:
          await create_withdrawal_x_chain_relayer_transaction();
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
