// SPDX-License-Identifier: MIT
import {CyKlone, CyKloneTree, CyKloneTransactionBuilder} from 'cyklone_js';
import { promises} from 'fs'
import {hash} from '@kadena/cryptography-utils'

const MNEMONIC = "obscure vivid ill elite sister evoke faculty accident slide alter kiwi captain"

const RELAY_MODULE = "free.cyKlone-relay-v0"

const MAIN_WITHDRAWER = "bob"

const compute_cap_guard_principal = (account) => "c:" + hash(`${RELAY_MODULE}.RELAY"${account}"`)



const PROOFS_TO_GENERATE = {
'0': [0, 1, 19],
'1': [1, 2, 3, 10, 19],
'2': [2, 3, 19],
'3': [3,],
'4': [4,40],
'10':[10, 18],
'19':[19,],
'40':[40,],
'41':[41,],
}

const nothing = () => undefined
const reject = async () => {throw new Error("")}
const local_read = (x) => promises.readFile("./"+x);

class CyKloneTreeTest extends CyKloneTree
{
  constructor()
  {
    super(nothing, reject)
  }

  update()
  {
    return
  }

}

const cyKlone = new CyKlone(nothing, local_read, false);
var deposit_data;



async function gen_proof(withdrawer, deposit_index, tree_size)
{
  console.log(` ${deposit_index} => ${tree_size}`)
  const testTree = new CyKloneTreeTest()
  await testTree.load()
  testTree.insert_commitments(deposit_data.slice(0, tree_size+1).map( (x) => x.commitment_str))
  cyKlone.tree = testTree
  return await cyKlone.compute_withdrawal_data(withdrawer, MNEMONIC, deposit_index.toString())
}



function gen_pact_proof(deposit_index, tree_size)
{
  return gen_proof(MAIN_WITHDRAWER, deposit_index, tree_size)
         .then( (x) =>[`(defconst WITHDRAW_${deposit_index}_${tree_size}_NULL:string "${x.nullifier_hash}")`,
                        `(defconst WITHDRAW_${deposit_index}_${tree_size}_ROOT:string "${x.root}")`,
                        `(defconst WITHDRAW_${deposit_index}_${tree_size}_PROOF:string "${x.proof}")`])
}

function gen_pact_proof_relay(deposit_index, tree_size)
{
  const relayer = compute_cap_guard_principal(MAIN_WITHDRAWER)

  console.log(relayer)
  return gen_proof(relayer, deposit_index, tree_size)
         .then( (x) =>[`(defconst WITHDRAW_RELAY_${deposit_index}_${tree_size}_NULL:string "${x.nullifier_hash}")`,
                        `(defconst WITHDRAW_RELAY_${deposit_index}_${tree_size}_ROOT:string "${x.root}")`,
                        `(defconst WITHDRAW_RELAY_${deposit_index}_${tree_size}_PROOF:string "${x.proof}")`])
}



async function main()
{

  await cyKlone.init()

  console.log("Generate deposits")
  deposit_data = Array.from({length: 50}, (x, i) => i)
                       .map( (x)=> cyKlone.compute_deposit_data(MNEMONIC, x.toString()))

  const pact_deposits_list = deposit_data.map( (x,i) => `(defconst DEPOSIT_${i}:string "${x.commitment_str}")`)

  console.log("Generate stndard proofs")
  const pact_withd_list = []
  for (const k of Object.keys(PROOFS_TO_GENERATE))
  {
    for(const tree_idx of PROOFS_TO_GENERATE[k])
    {
      let x = await gen_pact_proof(parseInt(k), tree_idx);
      pact_withd_list.push(...x)
    }
  }

  console.log("Generate relay proofs")
  const pact_withd_relay_list = [
    ...(await gen_pact_proof_relay(0,0)),
    ...(await gen_pact_proof_relay(1,1)),
  ]

  const pact_code = `
; Generated test vectors
; Do not modifiy by hand
(module test-vectors G
  (defcap G() true)
; --------------------------- DEPOSITS -----------------------------------------
  ${pact_deposits_list.join('\n  ')}
; ------------------------- STANDARD WITHDRAWALS -------------------------------
  ${pact_withd_list.join('\n  ')}
; -------------------------- RELAY WITHDRAWAL ----------------------------------
  ${pact_withd_relay_list.join('\n  ')}
)
`
  await promises.writeFile("test-vectors.pact", pact_code)
}

main()
