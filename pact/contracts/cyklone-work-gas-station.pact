(module cyKlone-work-gas-station GOVERNANCE
  (defconst VERSION 0.1)
  (implements gas-payer-v1)

  (use coin)
  (use util.guards)
  (use free.util-math)

  (defcap GOVERNANCE ()
    (enforce-keyset "free.cyKlone-test-ks"))

  (defconst ACCOUNT:string "cyKlone-work-gas")

  (defconst GAS-PRICE:decimal (xEy 1.0 -8))

  (defconst GAS-LIMIT:integer 120000)

  (defconst ALLOWED-CODE:[string] ["(free.cyKlone-v0-10.work)"])

  (defun gas-payer-account:string()
    ACCOUNT)

  (defcap GAS_PAYER:bool (user:string limit:integer price:decimal)
    (bind (read-msg) {'tx-type:=tx-type, 'exec-code:=exec-code}
      (enforce (= "exec" tx-type) "Inside an exec")
      (enforce (= ALLOWED-CODE exec-code) "Code incorrect for gas station"))

    (bind (chain-data) {'gas-price:=gas-price, 'gas-limit:=gas-limit }
      (enforce (and (= gas-price GAS-PRICE)
                    (= gas-limit GAS-LIMIT)) "Gas price/limit incorrect"))

    (let ((has-work (free.cyKlone-v0-10.has-work)))
      (enforce has-work "No work"))
    (compose-capability (ALLOW_GAS))
  )

  (defcap ALLOW_GAS () true)

  (defun init ()
    (with-capability (GOVERNANCE)
      (coin.create-account ACCOUNT (create-gas-payer-guard)))
  )

  (defun create-gas-payer-guard:guard ()
    (create-user-guard (gas-payer-guard))
  )

  (defun gas-payer-guard ()
    (require-capability (GAS))
    (require-capability (ALLOW_GAS))
  )
)
