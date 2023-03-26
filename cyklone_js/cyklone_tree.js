// SPDX-License-Identifier: MIT
import {MODULE} from './pact_modules.js'
import {buildPoseidonReference} from "circomlibjs"
import {MerkleTree} from "fixed-merkle-tree"
import {b64_to_dec} from "./codecs.js"

const ZERO = "8355858611563045677440680357889341193906656246723581940305640971585549179022";
const MAX_DOWNLOAD_LEAF = 100


class CyKloneTree
{
  constructor(kadena_local, resource_loader)
  {
    this.kadena_local = kadena_local;
    this.resource_loader = resource_loader;
    this.tree = undefined;
  }

  async load()
  {
    if(this.tree)
      return
    const poseidon = await buildPoseidonReference();
    const F = poseidon.F;
    const hashfn = (l, r) => {return F.toString(poseidon([l,r]),10) }

    return this.resource_loader("merkle_tree.json")
           .then((data) => {this.tree = MerkleTree.deserialize(JSON.parse(data), hashfn);
                            console.log(`Merkle loaded with ${this.tree.elements.length} elements`);},

                     () => {this.tree = new MerkleTree(18, [],  {hashFunction:hashfn, zeroElement:ZERO});
                            console.log("Merkle tree DB doesn't exist => Create")}
                );
  }

  get_deposit_chunk(start, end)
  {
    return this.kadena_local(`(${MODULE}.get-deposits-range ${start} ${end})`);
  }

  current_rank()
  {
    return this.kadena_local(`(at 'current-rank (${MODULE}.get-state))`);
  }


  async update()
  {
    const rank = await this.current_rank()
    let tree_size = this.tree.elements.length
    if(tree_size === rank)
    {
      console.log("Merkle_tree up to date")
      return
    }

    console.log(`Updating merkle tree ${tree_size} => ${rank}`)

    while(tree_size < rank)
    {
      let chunk = await this.get_deposit_chunk(tree_size, Math.min(tree_size + MAX_DOWNLOAD_LEAF, rank-1));
      console.log(`Updating Progress ${tree_size} => ${tree_size + chunk.length}`)
      this.tree.bulkInsert(chunk.map(b64_to_dec))
      tree_size = this.tree.elements.length
    }
    console.log("Update complete")
    //save_merkle_tree()
  }


}

export {CyKloneTree}
