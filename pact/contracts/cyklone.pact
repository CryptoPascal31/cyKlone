(module cyKlone-v0-10 GOVERNANCE
  (defconst VERSION:string "0.1")

  (use free.util-lists [remove-first append-last first replace-at])
  (use free.util-zk [BN128-GROUP-MODULUS])

  (use free.poseidon-hash-v1 [poseidon-hash])
  (use cyclone-withdraw-verifier-v0 [verify])

  (defcap GOVERNANCE () true)

  (defconst MERKLE-TREE-DEPTH:integer 18)

  (defconst MAXIMUM-DEPOSITS (^ 2 MERKLE-TREE-DEPTH))

  (defconst DENOMINATION:decimal 10.0)

  (defconst FEES:decimal 0.01)

  (defconst WITHDRAW-AMOUNT:decimal (- DENOMINATION FEES))


  (defschema merkle-data-schema
    subtrees:[integer]
    current-level:integer
    current-hash:integer
  )

  (defschema global-state-schema
    deposit-count:integer
    current-rank:integer
    withdrawal-count:integer
    last-known-roots:[integer]
    merkle-tree-data:object{merkle-data-schema}
    deposit-queue:[integer]
  )

  (defschema nullifier-schema
    withdrawn:bool
  )

  (defschema deposit-schema
    rank:integer
  )

  (deftable global-state:{global-state-schema})

  (deftable nullifiers:{nullifier-schema})

  (deftable deposits:{deposit-schema})

  (defcap RESERVE-SPEND () true)

  (defcap DO-WORK () true)

  (defcap WITHDRAWAL ()
    (compose-capability (RESERVE-SPEND)))

  (defconst ZEROS:[integer] [8355858611563045677440680357889341193906656246723581940305640971585549179022
                             14460290186982602856845142894824532904406068204758455493958564390328669703592
                             784645075456309464693580835304608741452170192947706750712048461654063101236
                             818232002504312885394229863079141174097918779609689671276921665478785103837
                             14886256272539355699270748660631447255064048986705034053716336748866163106006
                             3287384208769886595128392333423385665455942808653924453647557595765461977276
                             16594913838401802831970917239251384895578088317172068180882783924168244284002
                             2032469913440430591326012650704126850550927041744781071087211366372383278487
                             11241917363922439919810154107437530822571750233491864504955810002043833240309
                             21280666460214322444429926639515360072285093021177852591950964061285613510826
                             1971881597718183016197989065120279079284349296212983178968801029700945105372
                             18613898372621909731157607629308862502790513607936169830063573420014136896273
                             6936219470536776983377950540115820061119405637343177411699335542627205589803
                             6169677593484262542805857584178924750449177918200042838554121723519520216090
                             4315511128299287508902015138202462296796978100178519389803875250560644362536
                             4975779303672117635891852309998613366642568817212961531521723266758075694506
                             10162988321396705654057952610856417257234322789259805626437123361975652985685
                             15643591565536582692944226866997970792772779983528038950689066322189000603708])

  (defconst RESERVE-GUARD:guard (create-capability-guard (RESERVE-SPEND)))

  (defconst RESERVE:string (create-principal RESERVE-GUARD))

  (defconst WORK-GAS-STATION:string "cyKlone-work-gas")

  (defun ++:integer (x:integer)
    (+ 1 x))

  (defun --:integer (x:integer)
      (- x 1))

  (defun as-string:string (x:integer)
    (int-to-str 64 x))

  (defun as-int:integer (x:string)
    (str-to-int 64 x))

  (defun hash-bn128:integer (x:string)
    (mod (as-int (hash x)) BN128-GROUP-MODULUS))

  (defun is-bit-set:bool (x:integer position:integer)
    (!= 0 (& (shift 1 position) x)))


  (defun init ()
    (with-capability (GOVERNANCE)
      (coin.create-account RESERVE RESERVE-GUARD)
      (insert global-state ""
        {'deposit-count:0,
         'current-rank:0,
         'withdrawal-count:0,
         'last-known-roots:(make-list 32 0),
         'merkle-tree-data: {'subtrees:ZEROS, 'current-level:0, 'current-hash:0},
         'deposit-queue:[]}))
  )


  (defun has-work:bool ()
    (with-read global-state "" {'deposit-queue:=deposit-queue, 'merkle-tree-data:=merkle-state}
      (or?  (> (length deposit-queue))
            (> (at 'current-level merkle-state))
            0))
  )

  ; -------------------------- WORK FUNCTIONS ----------------------------------
  ;-----------------------------------------------------------------------------
  (defun hash-level:object{merkle-data-schema} (rank:integer tree-data:object{merkle-data-schema})
    @doc "Compute a level of the Merkle tree"
    (bind tree-data {'subtrees:=subtrees, 'current-level:=level, 'current-hash:=previous-hash}
      (let* ((on-left (not (is-bit-set rank level)))
             (new-hash (if on-left
                           (poseidon-hash [previous-hash (at level ZEROS)]) ; We are on left
                           (poseidon-hash [(at level subtrees) previous-hash])))) ; We come from right; take the last subtree from lef, and right

          { 'current-level: (++ level),
            'current-hash: new-hash,
            'subtrees: (if on-left (replace-at subtrees level previous-hash) subtrees)}))
  )

  (defun hash-multi-level:object{merkle-data-schema} (rank:integer input:object{merkle-data-schema})
    @doc "Compute three levels of the Merkle tree"
    (let* ((data  (hash-level rank input))
           (_data  (hash-level rank data))
           (__data  (hash-level rank _data)))
      __data)
  )

  (defun deposit-from-queue:object{merkle-data-schema}  (rank:integer in:object{merkle-data-schema})
    @doc "Take a deposit from the queue, and insert a leaf in the Merkle tree"
    (require-capability (DO-WORK))
    (with-read global-state "" {'deposit-queue:=deposit-queue}
      (let  ((new-deposit (first deposit-queue))) ; Get the first item of the deposit queue
        ; Insert the leaf in the deposits table
        (insert deposits (as-string new-deposit) {'rank:rank})
        ; Remove the item from the deposit queue
        (update global-state "" {'deposit-queue: (remove-first deposit-queue)})
        ; Insert the commitment into the future computation of the tree.
        (+ {'current-hash:new-deposit} in)))
  )

  (defun register-root:object{merkle-data-schema}  (rank:integer in:object{merkle-data-schema})
    @doc "Function to be called when the full Merkle Tree (ie the root) has been computed \
        \ Store the root in the list of the last known roots"
    (require-capability (DO-WORK))
    (with-read global-state "" {'last-known-roots:=roots}
      (let* ((new-root (at 'current-hash in))
             (updated-roots (remove-first (append-last roots new-root))))
        (update global-state "" {'current-rank: (++ rank ), 'last-known-roots:updated-roots})
        (+ {'current-level:0} in)))
  )


  (defun do-step ()
    (require-capability (DO-WORK))
    (with-read global-state "" {'merkle-tree-data:=data_0, 'current-rank:=rank, 'last-known-roots:=roots}

      (let* ((data_1 (if (= (at 'current-level data_0) 0)
                         (deposit-from-queue rank data_0)
                         data_0))

             (data_2 (hash-multi-level rank data_1))

             (data_3 (if (= (at 'current-level data_2) MERKLE-TREE-DEPTH)
                         (register-root rank data_2)
                         data_2)))
        (update global-state "" {'merkle-tree-data: data_3})))
  )

  (defun work ()
    (let ((x (has-work)))
      (enforce x "There is no work"))
    (with-capability (DO-WORK)
      (do-step))
  )


  (defun deposit (src-account:string commitment:string)
    (with-read global-state "" {'deposit-count:=count, 'deposit-queue:=queue}
      ; Check that the maximum deposits count hasn't be reached
      (enforce (< count MAXIMUM-DEPOSITS) "Deposits limit reached")
      ; Check that the commitment is not already in the deposit queue
      (enforce (not (contains (as-int commitment) queue)) "Deposit already submitted")
      ; Check that the deposit hasn't already done
      (with-default-read deposits commitment {'rank:-1} {'rank:=rank}
        (enforce (= -1 rank) "Deposit already submitted"))

      ; Transfer the money from the depositor to the main reserve
      (coin.transfer-create src-account RESERVE RESERVE-GUARD DENOMINATION)

      ; Transfer one part to the gas station for future work
      (with-capability (RESERVE-SPEND)
        (install-capability (coin.TRANSFER RESERVE WORK-GAS-STATION 10.0))
        (coin.transfer RESERVE WORK-GAS-STATION FEES))
      (update global-state ""
              {'deposit-count: (++ count),
               'deposit-queue: (append-last queue (as-int commitment))
              }))
  )


  (defun enforce-withdraw (dst-account:string nullifier-hash:string root:string proof:string)
    @doc "Internal function only, do all common check to be sure that the withdrawal is legit \
       \  + Increment withdrawals counter"
    (require-capability (WITHDRAWAL))
    ; Check that that the nullifier was never been seen before (prevent double withdrawal)
    (with-default-read nullifiers nullifier-hash {'withdrawn:false} {'withdrawn:=x}
      (enforce (not x) "Element already withdrawn"))

    ; Check that the provided root is known by the contract
    (with-read global-state "" {'last-known-roots:=known-roots}
      (enforce (contains (as-int root) known-roots) "Merkle tree root unknown"))

    ;Check ZK Proof
    (let ((account-hash (hash-bn128 dst-account))
          (outputs (map (as-int) [nullifier-hash root])))
      (enforce (verify account-hash outputs proof) "ZK Prof does not match"))

    ; Increment the withdrawal-count
    (with-read global-state "" {'withdrawal-count:=count}
      (update global-state "" {'withdrawal-count: (++ count)}))

    ; Insert the nullifier to prevent future double withdrawal
    (insert nullifiers nullifier-hash {'withdrawn:true})
  )

  (defun withdraw-create (dst-account:string dst-guard:guard nullifier-hash:string root:string proof:string)
    (with-capability (WITHDRAWAL)
      (enforce-withdraw dst-account nullifier-hash root proof)
      (install-capability (coin.TRANSFER RESERVE dst-account WITHDRAW-AMOUNT))
      (coin.transfer-create RESERVE dst-account WITHDRAW-AMOUNT dst-guard ))

  )

  (defun withdraw (dst-account:string nullifier-hash:string root:string proof:string)
    (with-capability (WITHDRAWAL)
      (enforce-withdraw dst-account nullifier-hash root proof)
      (install-capability (coin.TRANSFER RESERVE dst-account WITHDRAW-AMOUNT))
      (coin.transfer RESERVE dst-account WITHDRAW-AMOUNT))
  )


  ; -------------------------- LOCAL FUNCTIONS ---------------------------------
  ;-----------------------------------------------------------------------------
  (defun get-state ()
    @doc "Return the current state of the contract"
    (read global-state "")
  )

  (defun get-deposits-range (rank-min:integer rank-max:integer)
    @doc "Return all deposits in a rank range. A sorted list is returned, starting by rank-min"
    (let ((filter-func (lambda (k obj) (where 'rank (and? (<= rank-min) (>= rank-max)) obj)))
          (map-func (lambda (k obj) {'i:(at 'rank obj), 'v:k})))

      (map (at 'v ) (sort ['i] (fold-db deposits filter-func map-func))))
  )

)
