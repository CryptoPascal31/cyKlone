(namespace 'NAMESPACE)
include(../../pact/contracts/cyklone-withdraw-verifier-v0.pact)
include(../../pact/contracts/cyklone.pact)
ifdef(`INIT',`
(create-table global-state)
(create-table nullifiers)
(create-table deposits)', `')
