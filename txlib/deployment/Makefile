MACROS=-DNAMESPACE=free #-DINIT
DATA_FILE=testnet_data.yaml

all: cyklone.json cyklone-work-gas-station.json poseidon.json poseidon-constants.json

.%.pact: %.m4
	m4 ${MACROS} $< > $@

%.yaml: .%.pact
	kda gen -t $*.tkpl -d ${DATA_FILE} -o $@

%.json: %.yaml
	kda sign $< -k ../../keys/80c.yaml
	kda sign $< -k ../../keys/e37.yaml

clean:
	rm -f .*.pact
	rm -f *.json
	find . -name "*.yaml" |grep -v "_data.yaml" | xargs rm -f
