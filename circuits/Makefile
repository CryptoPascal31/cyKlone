PACT_GEN=pact_zk_gen
CLIENT_ZKP_DATA=../client/zkp
GEN_TESTS_ZKP_DATA=../gen_test_vectors/zkp
CONTRACTS_DIR=../pact/contracts
MODULE_NAME=cyklone-withdraw-verifier-v0


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
	mkdir -p ${GEN_TESTS_ZKP_DATA}

	gzip -c commitment_hasher.out > ${CLIENT_ZKP_DATA}/commitment_hasher.out.gz
	gzip -c withdraw.out > ${CLIENT_ZKP_DATA}/withdraw.out.gz
	gzip -c proving.key > ${CLIENT_ZKP_DATA}/proving.key.gz

	gzip -c commitment_hasher.out > ${GEN_TESTS_ZKP_DATA}/commitment_hasher.out.gz
	gzip -c withdraw.out > ${GEN_TESTS_ZKP_DATA}/withdraw.out.gz
	gzip -c proving.key > ${GEN_TESTS_ZKP_DATA}/proving.key.gz

clean:
	rm -f .pact_zk_state
	rm -f ${MODULE_FILE}
	rm -f *.repl
	rm -f *.key
	rm -f *.json
	rm -f *.out
	rm -f *.r1cs
	rm -f witness
