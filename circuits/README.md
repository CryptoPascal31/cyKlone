# cyKlone Circuits

This directory contains the ZK circuits, developed in ZoKrates language.

## Circuits

```
                                  ┌───────────────────┐
                                  │  nullifier_hasher │
                                  │                   │
                                  │   ( Pedersen )    │
                                  │                   │
                                  └──────────▲─────┬──┘
                                             │     │
                                  ┌──────────┼─────┼───────────────────────────────────────┐
                                  │          │     │                                       │
                                  │          │     │                                       │
PUBLIC >|  account_hash ─────────►│          │     └───────────────────────────────────────┼───►  nullifier_hash
                                  │          │                                             │
        ┌──                       │          │                                             │
        │  merkle_path[]─────────►├──────────┼───────────────────────────────┐             │
        │                         │          │                               │             │
        │                         │          │                               │             │
        │  merkle_indices ───────►├──────────┼───────────────────────────┐   │             │
SECRET >│                         │          │       withdraw            │   │             │
        │                         │          │                           │   │             │
        │  nullifier─────────────►├──────────┤                           │   │             │
        │                         │          │      ┌────────────┐       │   │         ┌───┼────►  merkle_root
        │                         │          │      │            │       │   │         │   │
        │  secret ───────────────►├─────┐    │      │            │       │   │         │   │
        └──                       │     │    │      │            │       │   │         │   │
                                  └─────┼────┼──────┼────────────┼───────┼───┼─────────┼───┘
                                        │    │      │            │       │   │         │
                                  ┌─────▼────▼──────┴───┐   ┌────▼───────▼───▼─────────┴───┐
                                  │                     │   │                              │
                                  │   commitment_hasher │   │        merkle_tree           │
                                  │                     │   │                              │
                                  │      ( Pedersen )   │   │        ( Poseidon )          │
                                  │                     │   │                              │
                                  └─────────────────────┘   └──────────────────────────────┘
```

[link](https://asciiflow.com/#/share/eJzNV0tOwzAQvYrlFUhdgYSgiy6oukCwqPisCKoiZ1AsEhs5rtqq9BaoB2FZcRpOQoBQtY2d2LHV1JpFYnv8Zt7zd45ZmALuYjK7TjgDRKggYypxByfhDETeMg%2FwNMDdi9OzToBn%2BdfJ%2Bc%2BXhKnMfwKMasvX%2B6eLBQEzwkCIjZOEPlMQozjMYhDIyltVa%2BF9hIYQgciAoWN7bwfsGlt%2BuHKrCNZfeIdk9npt8GHO4P5ghg%2BXN1d91HtDKCSEj5n8XRmVsixXOuj2bbnaXeTNuTQt24KtY9kLFEIpiJcERq%2BhjB%2BfamVr3erS8cPaIQEVAlEWUQKZZpm0J442ibtB%2F3Zwj3oN2JpQGUcinJS77kUYY6j1TmFKl5lMPkKzYsF6%2BZXDqM56PYsF59I1VHUnZUhqbjIgAqTlgaORznNwlRPgv8UzrL7YMdS2WVw13Rhsyt3OFDLYDBTj6Lw2621OA4cnhG47UnWzgCE8TalMobhL%2Fr2ytmGK3UQKgMYwunrP2aDSw60Ek7fzDGjEi4ddQxhlvc9s3M3XOFXzGS%2Fw4htgoctQ)

## Notes

Only the nullifier hash is transmitted to the smart contract. I believe that hashing the nullifier is not necessary from a security point of view. However, Tornado Cash is doing the same thing. In case, I'm missing something I prefer to do it as well.

The account is hashed (Blake2) by the client in JS, and then by the smart contract during verification. This is necessary, because in Kadena there is no constraint on the account length:  opposite to Ethereum where an account can only be a 256 bits pubKey. A hash allow to pack the account name to 256 bits.

## Compilation

Toolchain:
   - [ZoKrates](https://zokrates.github.io/) for circuit development and compilation
   - [Pact ZK tool](https://github.com/CryptoPascal31/pact-zk-generator) for Pact module automatic generation.

Compilation (unsafe only for tests):
```shell
make all
```

Deployment: (copy for use by the clients or smart-contract):
```shell
make deploy
```
