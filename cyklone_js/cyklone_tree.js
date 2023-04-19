// SPDX-License-Identifier: MIT
import {MODULE} from './pact_modules.js'
import {gzip, ungzip} from "pako"
import {buildPoseidonReference} from "circomlibjs"
import {MerkleTree} from "fixed-merkle-tree"
import {b64_to_dec} from "./codecs.js"

const ZERO = "8355858611563045677440680357889341193906656246723581940305640971585549179022";
const MAX_DOWNLOAD_LEAF = 128;

/* Encoding and Decoding functions */
const td = new TextDecoder('ascii');
const to_json = (x) => JSON.parse(td.decode(ungzip(x)))
const to_bin = (x) =>  gzip(JSON.stringify(x))

class CyKloneTree
{
  constructor(kadena_local, resource_loader, pool="")
  {
    this.kadena_local = kadena_local;
    this.resource_loader = resource_loader;
    this.pool = pool;
    this.tree = undefined;
  }

  async load()
  {
    if(this.tree)
      return
    const poseidon = await buildPoseidonReference();
    const F = poseidon.F;
    const hashfn = (l, r) => {return F.toString(poseidon([l,r]),10) }

    return this.resource_loader(this.backup_filename)
           .then(to_json)
           .then((data) => {this.tree = MerkleTree.deserialize(data, hashfn);
                            console.log(`Merkle loaded with ${this.tree.elements.length} elements`);},

                     () => {this.tree = new MerkleTree(18, [],  {hashFunction:hashfn, zeroElement:ZERO});
                            console.log("Merkle tree DB doesn't exist => Create")}
                );
  }

  get backup_filename()
  {
    return `merkle_tree_${this.pool}.json.gz`;
  }

  get_deposit_chunk(start, end)
  {
    return this.kadena_local(`(${MODULE}.get-deposits-range "${this.pool}" ${start} ${end})`);
  }

  insert_commitments(chunk)
  {
    this.tree.bulkInsert(chunk.map(b64_to_dec));
  }

  async update()
  {

    let dl_chunk_size = MAX_DOWNLOAD_LEAF;
    while(dl_chunk_size === MAX_DOWNLOAD_LEAF)
    {
      const start_index = this.tree.elements.length;
      const end_index = start_index + MAX_DOWNLOAD_LEAF - 1;
      const chunk = await this.get_deposit_chunk(start_index, end_index);
      dl_chunk_size = chunk.length;
      if(dl_chunk_size > 0)
      {
        console.log(`Merkle Tree update Progress ${start_index} => ${start_index + dl_chunk_size}`)
        this.insert_commitments(chunk)
      }
    }
    console.log("Merkle Tree update complete")
  }

  dump()
  {
    return to_bin(this.tree.serialize())
  }

}

export {CyKloneTree}
