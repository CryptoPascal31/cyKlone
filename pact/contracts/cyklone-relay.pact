(module cyKlone-relay-v0 GOVERNANCE
  (defconst VERSION:string "0.22")
  (implements gas-payer-v1)

  (use free.util-math [xEy])
  (use free.util-strings [starts-with])
  (use free.util-lists [first])
  (use cyKlone-v0-multipool [withdraw-create] )

  (defcap GOVERNANCE ()
    (enforce-keyset "free.cyKlone-test-ks"))


  ; -------------------- GAS PAYER SETTINGS ------------------------------------
  (defconst GAS-PAYER-ACCOUNT:string "cyKlone-multi-v0-relay-gas")

  (defconst GAS-PRICE-MAX:decimal (xEy 1.0 -8))

  (defconst GAS-LIMIT-MAX:integer 35000)

  (defconst TOTAL-GAS:decimal (* GAS-PRICE-MAX GAS-LIMIT-MAX))

  (defconst ALLOWED-CODE:string "(free.cyKlone-relay-v0.relay-withdraw-create")

  (defun gas-payer-account:string()
    GAS-PAYER-ACCOUNT)

  (defcap GAS_PAYER:bool (user:string limit:integer price:decimal)
    (bind (read-msg) {'tx-type:=tx-type, 'exec-code:=exec-code}
      (enforce (= "exec" tx-type) "Inside an exec")
      (enforce (= 1 (length exec-code)) "Code incorrect for gas station")
      (enforce (starts-with (first exec-code) ALLOWED-CODE) "Code incorrect for gas station"))

    (bind (chain-data) {'gas-price:=gas-price, 'gas-limit:=gas-limit }
      (enforce (and (<= gas-price GAS-PRICE-MAX)
                    (<= gas-limit GAS-LIMIT-MAX)) "Gas price/limit incorrect"))

    (compose-capability (ALLOW_GAS))
  )

  (defcap ALLOW_GAS () true)

  (defun init ()
    (with-capability (GOVERNANCE)
      (coin.create-account GAS-PAYER-ACCOUNT (create-gas-payer-guard)))
  )

  (defun create-gas-payer-guard:guard ()
    (create-user-guard (gas-payer-guard))
  )

  (defun gas-payer-guard ()
    (require-capability (coin.GAS))
    (require-capability (ALLOW_GAS))
  )


  ; -----------------------  WITHDRAWAL CODE -----------------------------------
  (defcap RELAY (dst-account:string) true)

  (defun relayer-account-guard:guard (dst-account:string)
    (create-capability-guard (RELAY dst-account)))

  (defun relayer-account:string (dst-account:string)
    (create-principal (relayer-account-guard dst-account)))

  (defun --withdraw-to-relayer (dst-account:string  nullifier-hash:string root:string proof:string)
    @doc "Common function to withdraw from cyKlone to a temporary account and refund the gas station"
    (let* ((relayer-act (relayer-account dst-account))
           (relayer-guard (relayer-account-guard dst-account))
           ; First step => withdraw to the relayer account
           ; Remark: (withdraw-create) returns the withdrawn amount; we will use it
           (withdrawn-amount (withdraw-create relayer-act relayer-guard nullifier-hash root proof)))

      ;Second step => Refun the Gas station
      (with-capability (RELAY dst-account)
        (install-capability (coin.TRANSFER relayer-act (gas-payer-account) TOTAL-GAS))
        (coin.transfer relayer-act (gas-payer-account) TOTAL-GAS))

        ;Finally the total withdrawable amount
        (- withdrawn-amount TOTAL-GAS))
  )

  (defun relay-withdraw-create (dst-account:string dst-guard:guard nullifier-hash:string root:string proof:string)
    @doc "User callable function to withdraw from the relay account and make a transfer-create to the final user account"
    ; First step => Withdraw to relay
    (let* ((relayer-act (relayer-account dst-account))
           (final-amount (--withdraw-to-relayer dst-account nullifier-hash root proof)))

      ; Second step => Pay the user account
      (with-capability (RELAY dst-account)
        (install-capability (coin.TRANSFER relayer-act dst-account final-amount))
        (coin.transfer-create relayer-act dst-account dst-guard final-amount)))
  )
)
