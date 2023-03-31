(module cyKlone-work-gas-station GOVERNANCE
  (defconst VERSION:string "0.21")
  (implements gas-payer-v1)

  (use coin)
  (use util.guards)
  (use free.util-math)
  (use cyKlone-v0-multipool [has-work WORK-GAS])

  (defcap GOVERNANCE ()
    (enforce-keyset "free.cyKlone-test-ks"))

  (defconst GAS_PAYER_ACCOUNT:string "cyKlone-multi-v0-work-gas")

  (defconst GAS-PRICE:decimal (xEy 1.0 -8))

  (defconst GAS-LIMIT:integer WORK-GAS)

  (defconst ALLOWED-CODE:[string] ["(free.cyKlone-v0-multipool.work)"])

  (defun gas-payer-account:string()
    GAS_PAYER_ACCOUNT)

  (defcap GAS_PAYER:bool (user:string limit:integer price:decimal)
    (bind (chain-data) {'gas-price:=gas-price, 'gas-limit:=gas-limit }
      (enforce (and (= gas-price GAS-PRICE)
                    (= gas-limit GAS-LIMIT)) "Gas price/limit incorrect"))

    (bind (read-msg) {'tx-type:=tx-type, 'exec-code:=exec-code, 'exec-user-data:=user-data}
      (enforce (= "exec" tx-type) "Inside an exec")
      (enforce (= ALLOWED-CODE exec-code) "Code incorrect for gas station")
      (enforce (contains 'pool user-data) "User data incorrect for gas station")

      (let ((has-work (has-work (at 'pool user-data))))
        (enforce has-work "No work")))

    (compose-capability (ALLOW_GAS))
  )

  (defcap ALLOW_GAS () true)

  (defun init ()
    (with-capability (GOVERNANCE)
      (coin.create-account (gas-payer-account) (create-gas-payer-guard)))
  )

  (defun create-gas-payer-guard:guard ()
    (create-user-guard (gas-payer-guard))
  )

  (defun gas-payer-guard ()
    (require-capability (GAS))
    (require-capability (ALLOW_GAS))
  )
)
