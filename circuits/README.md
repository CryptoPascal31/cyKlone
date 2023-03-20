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
account_hash ─────────►│          │     └───────────────────────────────────────┼───►  nullifier_hash
                       │          │                                             │
                       │          │                                             │
merkle_path[]─────────►├──────────┼───────────────────────────────┐             │
                       │          │                               │             │
                       │          │                               │             │
merkle_indices ───────►├──────────┼───────────────────────────┐   │             │
                       │          │       withdraw            │   │             │
                       │          │                           │   │             │
nullifier─────────────►├──────────┤                           │   │             │
                       │          │      ┌────────────┐       │   │         ┌───┼────►  merkle_root
                       │          │      │            │       │   │         │   │
secret ───────────────►├─────┐    │      │            │       │   │         │   │
                       │     │    │      │            │       │   │         │   │
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
[link](https://asciiflow.com/#/share/eJzVV0tOwzAQvYrlFUhdIdRCTsEeo8pKBsUisZHjqq2q3gLlICwrTsNJCBBVpbFjTz4ErFk4jv3mzfOMZe%2Bo5DnQSK6ybEYzvgVNI7pjdMNodHu9mDG6rXpXN%2FOqZ2Bjqg9Gib29v7z1McakG5iQT4riUYBeprxIQRP%2FEtuob8kFuYMEdAGSXAYuwXrxWPnaSSQLrZ5E%2FpIF7sFJ5H6ZgjTqj83jWK2k%2BUrbVtXLg8vf9FYezisQqVpow%2B8HDjkH%2FZTB8pmb9P7BuxuT22ja%2FD52rbyQiYihcKT1dKoPpMlamDTRfN2cOpbibejHkg3VIUz%2FjmxQsaJrpOm5PVBC6ozUSpkO7OyTrCyOChQQazDII92xJ0Pw8cQ8upd%2FZL6bVz%2BtUCqdJURAzVpwXKtOxzGnMfaW7DoqbNN82LHKc2FyqG9Z34%2BDn9h1rRsNgMMekzdpvDca2NV%2FVYBIVP0emZ53fxsKpy0b6Z7uPwAvw3XE))

## Compilation

Toolchain:
   - [ZoKrates](https://zokrates.github.io/) for circuit development and compilation
   - [Pact ZK tool](https://github.com/CryptoPascal31/pact-zk-generator) for Pact module automatic generation.

Compilation (unsafe only for tests):
```shell
make all
```

Deployement: (copy for use by the clients or smart-contract):
```shell
make deploy
```
