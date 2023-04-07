// SPDX-License-Identifier: MIT

import {Scalar as S} from 'ffjavascript'
import {hashBin, base64UrlDecodeArr, base64UrlEncodeArr } from '@kadena/cryptography-utils'

const P = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

export function int_to_b64(x)
{
  let buffer = new Uint8Array(32)
  S.toRprBE(buffer, 0, S.e(x), 32)
  /* Workaround in case if the number is too short, and the first elements of the
     (BE) array are null */
  while(buffer[0] == 0)
    buffer = buffer.subarray(1);
  return base64UrlEncodeArr(buffer)
}

export function int256_to_b64(x)
{
  let buffer = new Uint8Array(32)
  S.toRprBE(buffer, 0, S.e(x), 32)
  return base64UrlEncodeArr(buffer)
}

export function b64_to_dec(x)
{
  let buffer = base64UrlDecodeArr(x);
  /* Workaround in case if the number is too little, and the array is less than
     32 bytes */
  while(buffer.length < 32)
    buffer = new Uint8Array([0, ...buffer]);
  return S.fromRprBE(buffer,0).toString();
}

export function hash_dec(x)
{
  const buffer = hashBin(x);
  return S.mod(S.fromRprBE(buffer,0),P).toString();
}

export function encode_proof(proof)
{
  const proof_tab = [...proof.a, ...proof.b[0], ...proof.b[1], ...proof.c];
  return proof_tab.map(int256_to_b64).join("");
}
