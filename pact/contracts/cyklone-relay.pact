(module cyKlone-relay-v0 GOVERNANCE
  (defconst VERSION:string "0.25")
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

  (defconst TOTAL-GAS:decimal (* GAS-PRICE-MAX (dec GAS-LIMIT-MAX)))

  (defconst ALLOWED-WITHDRAW-CREATE:string "(free.cyKlone-relay-v0.relay-withdraw-create")

  (defconst ALLOWED-WITHDRAW-XCHAIN:string "(free.cyKlone-relay-v0.relay-withdraw-xchain")

  (defconst XCHAIN-ENABLED:bool true)


  (defun gas-payer-account:string()
    GAS-PAYER-ACCOUNT)

  (defcap GAS_PAYER:bool (user:string limit:integer price:decimal)
    (bind (read-msg) {'tx-type:=tx-type, 'exec-code:=exec-code}
      (enforce (= "exec" tx-type) "Inside an exec")
      (enforce (= 1 (length exec-code)) "Code incorrect for gas station")
      (enforce (or (starts-with (first exec-code) ALLOWED-WITHDRAW-CREATE)
                   (starts-with (first exec-code) ALLOWED-WITHDRAW-XCHAIN))
               "Code incorrect for gas station"))

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
    ; First step => compute the accounts credentials and withdraw from cyKlone to the relayer account
    ; Remark: (withdraw-create) returns the withdrawn amount; we will use it
    (let* ((relayer-act (relayer-account dst-account))
           (relayer-guard (relayer-account-guard dst-account))
           (withdrawn-amount (withdraw-create relayer-act relayer-guard nullifier-hash root proof)))

      ;Second step => Refun the Gas station
      (with-capability (RELAY dst-account)
        (install-capability (coin.TRANSFER relayer-act (gas-payer-account) TOTAL-GAS))
        (coin.transfer relayer-act (gas-payer-account) TOTAL-GAS))

        ;Finally return the total withdrawable amount
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

  (defun relay-withdraw-xchain (dst-account:string dst-guard:guard target-chain:string nullifier-hash:string root:string proof:string)
    @doc "User callable function to withdraw from the relay account and make a transfer-create to the final user account"
    (enforce XCHAIN-ENABLED "X-chain withdrawal disabled")
    ; First step => Withdraw to relay
    ; _dst-account is set to account+chain_id
    (let* ((_dst-account (+ dst-account target-chain))
           (relayer-act (relayer-account _dst-account))
           (final-amount (--withdraw-to-relayer _dst-account nullifier-hash root proof)))

      ; Second step => Launch the X-chain transfer
      (with-capability (RELAY _dst-account)
        (install-capability (coin.TRANSFER_XCHAIN relayer-act dst-account final-amount target-chain))
        (coin.transfer-crosschain relayer-act dst-account dst-guard target-chain final-amount)))
  )
)
