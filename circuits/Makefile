PACT_GEN=python3 ../../pact-zk-generator/run_zk_gen.py
CLIENT_ZKP_DATA=../client/zkp
CONTRACTS_DIR=../pact/contracts
MODULE_NAME=cyclone-withdraw-verifier-v0


MODULE_FILE=${MODULE_NAME}.pact

all: withdraw.out commitment_hasher.out nullifier_hasher.out ${MODULE_FILE}
module: ${MODULE_FILE}
deploy: deploy_module deploy_client

verification.key proving.key &: withdraw.out
	zokrates setup -i withdraw.out

${MODULE_FILE}: verification.key
	ln -sf withdraw_abi.json abi.json
	${PACT_GEN} gen-module --module-name ${MODULE_NAME}

%.out: %.zok
	zokrates compile -i $< -o $@ -s $*_abi.json


deploy_module: ${MODULE_FILE}
	cp ${MODULE_FILE} ${CONTRACTS_DIR}

deploy_client: commitment_hasher.out withdraw.out proving.key
	mkdir -p ${CLIENT_ZKP_DATA}
	cp commitment_hasher.out ${CLIENT_ZKP_DATA}
	cp withdraw.out ${CLIENT_ZKP_DATA}
	cp proving.key ${CLIENT_ZKP_DATA}

clean:
	rm -f .pact_zk_state
	rm -f ${MODULE_FILE}
	rm -f *.repl
	rm -f *.key
	rm -f *.json
	rm -f *.out
	rm -f *.r1cs
	rm -f witness
