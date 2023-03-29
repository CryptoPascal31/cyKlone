#MACROS=-DNAMESPACE=free -DINIT
MACROS=-DNAMESPACE=free
DATA_FILE=testnet_data.yaml
KEY_A=../../keys/80c.yaml
KEY_B=../../keys/e37.yaml

all: cyklone.json cyklone-work-gas-station.json cyklone-relay.json poseidon.json poseidon-constants.json

.%.pact: %.m4
	m4 ${MACROS} $< > $@

%.yaml: .%.pact
	kda gen -t $*.tkpl -d ${DATA_FILE} -o $@

%.json: %.yaml
	test -f ${KEY_A} && kda sign $< -k ${KEY_A} || true
	test -f ${KEY_B} && kda sign $< -k ${KEY_B} || true

clean:
	rm -f .*.pact
	rm -f *.json
	find . -name "*.yaml" |grep -v "_data.yaml" | xargs rm -f
