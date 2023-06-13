(module cyKlone-v0-multipool UPGRADE-MODULE
  (defconst VERSION:string "0.35")
  (defconst MODULE-FREEZE-DATE (time "2023-10-30T00:00:00Z"))

  (use free.util-math [xEy ++ --])
  (use free.util-lists [remove-first append-last first replace-at])
  (use free.util-zk [BN128-GROUP-MODULUS])
  (use free.util-time [is-future])

  (use free.poseidon-hash-v1 [poseidon-hash])
  (use cyklone-withdraw-verifier-v0 [verify])

  (defcap UPGRADE-MODULE ()
    ; After freeze date the module becomes not upgradable
    (enforce (is-future MODULE-FREEZE-DATE) "Module is definitively frozen")
    (enforce-keyset "free.cyKlone-test-ks")
  )

  (defcap POOLS-GOVERNANCE ()
    (enforce-keyset "free.cyKlone-test-ks")
  )


  ; -------------------------- CONSTANTS ---------------------------------------
  ;-----------------------------------------------------------------------------
  ; Total height of the Merkle tree
  (defconst MERKLE-TREE-DEPTH:integer 18)

  ; Number of levels of the Merkle tree computed per round of work
  (defconst COMPUTED-LEVELS-PER-ROUND:integer 3)

  ; Number of work rounds needed for complete (ie root) computation
  (defconst WORK-ROUNDS:integer (/ MERKLE-TREE-DEPTH COMPUTED-LEVELS-PER-ROUND))

  ; Maximum number of allowed deposits => After the contract is dead
  (defconst MAXIMUM-DEPOSITS (^ 2 MERKLE-TREE-DEPTH))

  ; The maximum cost of a round of computation
  (defconst WORK-GAS:integer 120000)

  ; Total Fees to be transfered for pre-payment to the gas station
  ; = Number of Rounds * Round Cost * Gas Price
  (defconst FEES:decimal (xEy (dec (* WORK-ROUNDS WORK-GAS)) -8))

  ; -------------------------- DATA AND TABLES ---------------------------------
  ;-----------------------------------------------------------------------------
  (defschema merkle-data-schema
    @doc "Current state of the Merkle tree calculation"
    subtrees:[integer] ;The hash of the nodes (on for each level) of the completed subtrees from left
    current-level:integer ;State of the calculation: last computed level of the tree
    current-hash:integer ;Hash the last computed node
  )

  (defschema pool-state-schema
    @doc "Global state of the contract => Only one instance is stored"
    deposit-amount:decimal ; Amount to deposit
    deposit-count:integer ;The total of deposit already made (including thoses in queue)
    current-rank:integer ; The rank of the next deposit. The rank is updated once a deposit has been fully computed
    withdrawal-count:integer ; The total number of withdrawals already made
    last-known-roots:[integer] ;The last 32 computed roots of the Merkle tree
    merkle-tree-data:object{merkle-data-schema} ;Current state of the merkle tree calculation
    deposit-queue:[integer] ; The queue of deposits but not already inserted into the tree
    last-work-block:integer; Last block where the (work) was triggered
  )

  (defschema nullifier-schema
    @doc "Store an already withrawn nullfier"
    withdrawn:bool
  )

  (defschema deposit-schema
    @doc "Store a deposit: ie a Merkle leaf"
    pool:string
    rank:integer
  )

  (deftable pool-state:{pool-state-schema})

  (deftable nullifiers:{nullifier-schema})

  (deftable deposits:{deposit-schema})


  ; -------------------------- INTERNAL CAPABILITIES ---------------------------
  ;-----------------------------------------------------------------------------
  ; Lock the reserve account
  (defcap RESERVE-SPEND () true)

  ; Prevent internal functions to be called out of the (work) function
  (defcap DO-WORK () true)

  ; Secondary capability acquired during a withdrawal => Unlock RESERVE-SPEND
  (defcap WITHDRAWAL ()
    (compose-capability (RESERVE-SPEND)))

  ; Secondary capability acquired during a de deposit when fuunding the gas
  ; station  => Unlock RESERVE-SPEND
  (defcap FUND-GAS-STATION ()
    (compose-capability (RESERVE-SPEND)))


  ; -------------------------- ACCOUNTS MANAGEMNT ------------------------------
  ;-----------------------------------------------------------------------------
  ; Guard for locking the reserve
  (defconst RESERVE-GUARD:guard (create-capability-guard (RESERVE-SPEND)))

  ; Reserve account name
  (defconst RESERVE:string (create-principal RESERVE-GUARD))

  ; Gas station to be funded for future gas spending during (work) calls
  (defconst WORK-GAS-STATION:string "cyKlone-multi-v0-work-gas")


  ; -------------------------- UTILITIES ---------------------------------------
  ;-----------------------------------------------------------------------------
  ; Pre-computed zeros of the Merkle tree
  ; ZEROS[0] is arbitrary chosen: modulo(BLAKE2S("cyKone"), P)
  ; ZEROS[1] = Poseidon (ZEROS[0], ZEROS[0])
  ; ...
  ; ZEROS[n] = Poseidon (ZEROS[n-1], ZEROS[n-1])
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

  (defun as-string:string (x:integer)
    @doc "Convert a base64 string to a 256 bits integer "
    (int-to-str 64 x))

  (defun as-int:integer (x:string)
    @doc "Convert a 256 bits integer to a base64 string"
    (str-to-int 64 x))

  (defun hash-bn128:integer (x:string)
    @doc "Hash (blake2) a string and outputs the result to a 256 bits integer modulo P"
    (mod (as-int (hash x)) BN128-GROUP-MODULUS))

  (defun is-bit-set:bool (x:integer position:integer)
    @doc "Return true if the bit at position is set"
    (!= 0 (& (shift 1 position) x)))

  (defun get-pool:string ()
    (read-string 'pool))

  ; -------------------------- ADMINISTRATIVE FUNCTIONS-------------------------
  ;-----------------------------------------------------------------------------
  (defun add-pool (pool:string amount:decimal)
    @doc "Add a pool"
    (with-capability (POOLS-GOVERNANCE)
      ; Create the global state entry with default values
      (insert pool-state pool
        {
         'deposit-amount:amount,
         'deposit-count:0,
         'current-rank:0,
         'withdrawal-count:0,
         'last-known-roots:(make-list 32 0),
         'merkle-tree-data: {'subtrees:ZEROS, 'current-level:0, 'current-hash:0},
         'deposit-queue:[],
         'last-work-block:0}))
  )


  ; -------------------------- WORK FUNCTIONS ----------------------------------
  ;-----------------------------------------------------------------------------
  (defun has-work:bool (pool:string)
    @doc "Return True if the contract needs for (work) being called"
    (with-read pool-state pool {'deposit-queue:=deposit-queue, 'merkle-tree-data:=merkle-state}
      (or?  (> (length deposit-queue)) ;If there are some stuffs in deposit queue => work is needed
            (> (at 'current-level merkle-state)) ;If current-level is not null, it means that a deposit is ongoing
            0))
  )

  (defun hash-level:object{merkle-data-schema} (rank:integer tree-data:object{merkle-data-schema})
    @doc "Compute a level of the Merkle tree"
    ; This algorithm is an exact copycat of Tornado Cash
    (bind tree-data {'subtrees:=subtrees, 'current-level:=level, 'current-hash:=previous-hash}
      ; Our provenance can be obtained by watching the bit N of the rank of the leaf
      (let* ((on-left (not (is-bit-set rank level)))
             (new-hash (if on-left
                           (poseidon-hash [previous-hash (at level ZEROS)]) ; We are on left
                           (poseidon-hash [(at level subtrees) previous-hash])))) ; We come from right; take the last subtree from lef, and right

          { 'current-level: (++ level),
            'current-hash: new-hash,
            ; When we come from left, we update the hash of the subree under.
            'subtrees: (if on-left (replace-at subtrees level previous-hash) subtrees)}))
  )

  (defun hash-multi-level:object{merkle-data-schema} (rank:integer input:object{merkle-data-schema})
    @doc "Compute three levels of the Merkle tree"
    (let* ((data  (hash-level rank input))
           (_data  (hash-level rank data))
           (__data  (hash-level rank _data)))
      __data)
  )

  (defun deposit-from-queue:object{merkle-data-schema}  (pool:string rank:integer in:object{merkle-data-schema})
    @doc "Take a deposit from the queue, and insert a leaf in the Merkle tree"
    (require-capability (DO-WORK))
    (with-read pool-state pool {'deposit-queue:=deposit-queue}
      (let  ((new-deposit (first deposit-queue))) ; Get the first item of the deposit queue
        ; Insert the leaf in the deposits table
        (insert deposits (as-string new-deposit) {'rank:rank,
                                                  'pool:pool})
        ; Remove the item from the deposit queue
        (update pool-state pool {'deposit-queue: (remove-first deposit-queue)})
        ; Insert the commitment into the future computation of the tree.
        (+ {'current-hash:new-deposit} in)))
  )

  (defun register-root:object{merkle-data-schema}  (pool:string rank:integer in:object{merkle-data-schema})
    @doc "Function to be called when the full Merkle Tree (ie the root) has been computed \
        \ Store the root in the list of the last known roots"
    (require-capability (DO-WORK))
    (with-read pool-state pool {'last-known-roots:=roots}
      (let* ((new-root (at 'current-hash in))
             ; Take the last roots lists and insert the new computed root, managing the list as a FIFO.
             ; => Remove the first element, and insert the new at the end;
             (updated-roots (remove-first (append-last roots new-root))))
        ; Increment the insertion rank (ready for the next leaf), and save the new known roots FIFO
        (update pool-state pool {'current-rank: (++ rank ), 'last-known-roots:updated-roots})
        ; Finally reset the Merkle state object, by forcing the current level of calculation to 0.
        (+ {'current-level:0} in)))
  )

  (defun do-step (pool:string)
    @doc "Do a step of work"
    (require-capability (DO-WORK))
    (with-read pool-state pool {'merkle-tree-data:=data_0, 'current-rank:=rank, 'last-known-roots:=roots}
      ; In case this is the first work iteration, insert a new leaf from the deposit queue
      (let* ((data_1 (if (= (at 'current-level data_0) 0)
                         (deposit-from-queue pool rank data_0)
                         data_0))

             ; Always, hash Three level of the tree
             (data_2 (hash-multi-level rank data_1))

             ; In case this is the last iteration, register the found root, and reset calculation
             (data_3 (if (= (at 'current-level data_2) MERKLE-TREE-DEPTH)
                         (register-root pool rank data_2)
                         data_2))
            (current-height (at 'block-height (chain-data))))
        (update pool-state pool {'merkle-tree-data: data_3,
                                 'last-work-block: current-height })))
  )

  (defun work ()
    @doc "Main public function to be called to trigger work"
    (let ((x (has-work (get-pool))))
      (enforce x "There is no work"))
    (with-capability (DO-WORK)
      (do-step (get-pool)))
  )


  ; -------------------------- DEPOSIT FUNCTIONS -------------------------------
  ;-----------------------------------------------------------------------------
  (defun deposit (src-account:string commitment:string)
    @doc "Public function to be called to do a deposit \
         \ The TRANSFER capability has to be set"
    (with-read pool-state (get-pool) {'deposit-count:=count,
                                        'deposit-queue:=queue,
                                        'deposit-amount:=amount}
      ; Check that the maximum deposits count hasn't be reached
      (enforce (< count MAXIMUM-DEPOSITS) "Deposits limit reached")
      ; Check that the commitment is not already in the deposit queue
      (enforce (not (contains (as-int commitment) queue)) "Deposit already submitted")
      ; Check that the deposit hasn't already done
      (with-default-read deposits commitment {'rank:-1} {'rank:=rank}
        (enforce (= -1 rank) "Deposit already submitted"))

      ; Transfer the money from the depositor to the main reserve
      (coin.transfer-create src-account RESERVE RESERVE-GUARD (+ amount FEES))

      ; Transfer one part to the gas station for future work
      (with-capability (FUND-GAS-STATION)
        ; We install more transfer capability than needed, because it allows
        ; to make several deposits in the same transaction. This is not 100% clean
        ; However it should be OK as the reseve is protected by the cap guard.
        (install-capability (coin.TRANSFER RESERVE WORK-GAS-STATION 1.0))
        (coin.transfer RESERVE WORK-GAS-STATION FEES))

      ; Update the data
      (update pool-state (get-pool)
              {'deposit-count: (++ count), ; Increment the deposit count
               'deposit-queue: (append-last queue (as-int commitment)) ;Append the deposit into the queue
              }))
  )


  ; -------------------------- WITHDRAW FUNCTIONS ------------------------------
  ;-----------------------------------------------------------------------------
  (defun enforce-withdraw (pool:string dst-account:string nullifier-hash:string root:string proof:string)
    @doc "Internal function only, do all common check to be sure that the withdrawal is legit \
       \  + Increment withdrawals counter"
    (require-capability (WITHDRAWAL))
    ;--- IMPORTANT REMARK => The same integer can have different base64 representations. Thats why
    ; it's necessary to normalize the nullifier by converting way and back  (string -> int -> string) before storing
    ; it in the table. Otherwise, this property could be exploited to withdraw twice.

    ; Convert everything to int => By convention every variables starting with i- will be integers
    (let ((i-nullifier-hash (as-int nullifier-hash))
          (i-root (as-int root))
          (i-account-hash (hash-bn128 dst-account)))

      ; Check that that the nullifier was never been seen before (prevent double withdrawal)
      (with-default-read nullifiers (as-string i-nullifier-hash) {'withdrawn:false} {'withdrawn:=x}
        (enforce (not x) "Element already withdrawn"))

      ;Check that the provided root is known by the contract
      (with-read pool-state pool {'last-known-roots:=known-roots}
        (enforce (contains i-root known-roots) "Merkle tree root unknown"))

      ;Check ZK Proof
      (enforce (verify i-account-hash [i-nullifier-hash i-root] proof) "ZK Proof does not match")

      ; Insert the nullifier to prevent future double withdrawal
      (insert nullifiers (as-string i-nullifier-hash) {'withdrawn:true}))

    ; Increment the withdrawal-count
    (with-read pool-state pool {'withdrawal-count:=count}
      (update pool-state pool {'withdrawal-count: (++ count)}))
  )

  (defun withdraw-create:decimal (dst-account:string dst-guard:guard nullifier-hash:string root:string proof:string)
    @doc "Public function to do a withdrawal using internally (coin.transfer-create) \
        \ Returns the withdrawn amount => Useful for the relayer"
    (with-read pool-state (get-pool) {'deposit-amount:=amount}
      (with-capability (WITHDRAWAL)
        (enforce-withdraw (get-pool) dst-account nullifier-hash root proof)
        (install-capability (coin.TRANSFER RESERVE dst-account amount))
        (coin.transfer-create RESERVE dst-account dst-guard amount))
      ; Return the withdrawn amount
      amount)
  )

  (defun withdraw:decimal (dst-account:string nullifier-hash:string root:string proof:string)
    @doc "Public function to do a withdrawal using internally (coin.transfer \
        \ Returns the withdrawn amount => Useful for the relayer"
    (with-read pool-state (get-pool) {'deposit-amount:=amount}
      (with-capability (WITHDRAWAL)
        (enforce-withdraw (get-pool) dst-account nullifier-hash root proof)
        (install-capability (coin.TRANSFER RESERVE dst-account amount))
        (coin.transfer RESERVE dst-account amount))
      ; Return the withdrawn amount
      amount)
  )


  ; -------------------------- LOCAL FUNCTIONS ---------------------------------
  ;-----------------------------------------------------------------------------
  (defun get-state:object{pool-state-schema} (pool:string)
    @doc "Return the current state of the contract"
    (read pool-state pool)
  )

  (defun get-deposits-range:[string] (pool:string rank-min:integer rank-max:integer)
    @doc "Return all deposits in a rank range. A sorted list is returned, starting by rank-min"
    (let ((filter-func (lambda (k obj) (and? (where 'pool (= pool))
                                             (where 'rank (and? (<= rank-min)
                                                                (>= rank-max))) obj)))
          (map-func (lambda (k obj) {'rank:(at 'rank obj), 'com:k})))
      (map (at 'com ) (sort ['rank] (fold-db deposits filter-func map-func))))
  )

  (defun get-deposit-data:object{deposit-schema} (commitment:string)
    @doc "Return the data of a commitment , Returns -1 for then rank if the commitment is not found"
    (try {'rank:-1, 'pool:""} (read deposits commitment))
  )

  (defun get-nullifier-state:bool (nullifier-hash:string)
    @doc "Return true if a nullifier has already been withdrawn, false otherwise"
    (with-default-read nullifiers nullifier-hash {'withdrawn:false} {'withdrawn:=state}
      state)
  )
)
