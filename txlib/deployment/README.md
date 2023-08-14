# cyKlone

## Deployment script

The directory contains deployment script for the cyKlone contracts:
* poseidon-constants
* poseidon
* cyklone
* cyklone-gas-station
* cyklone-relay

The following tools are needed to generate the deployment files:
* m4
* make
* kda (https://github.com/kadena-io/kda-tool)

The private keys from the `../../keys` directory are needed as well.

### Usage
Create the data file containing the deployment parameters (eg:  `testnet_data.yaml`)
```yaml
chain: 18
gov-key: e37880d37ef30a93aad57eddde5abc4b2af0c6d2269d4cfc33f3967502e7c54d
network: testnet04
sender: k:80c3124fa9bb647591ac5bff21a98c934cd72b4ef9f9cf3b7d8337a2a6dbfe70
sender-key: 80c3124fa9bb647591ac5bff21a98c934cd72b4ef9f9cf3b7d8337a2a6dbfe70
```

If it is the first deployment: in the Makefile, uncomment the line:
```Makefile
MACROS=-DNAMESPACE=free -DINIT
```

Set up the parameters YAML file in the Makefile
```Makefile
DATA_FILE=testnet_data.yaml
```

Run
```shell
make
```
to create the .json request files.

### Final deployment
Deploy the files on chain

Run
```shell
kda send poseidon-constants.json
# Wait 2 minutes
kda send poseidon.json
# Wait 2 minutes
kda send cyklone.json
# Wait 2 minutes
kda send cyklone-relay.json cyklone-work-gas-station.json

# Wait 2 minutes and check that evrything got properly mined and installed
kda poll poseidon-constants.json poseidon.json cyklone.json cyklone-relay.json cyklone-work-gas-station.json
```
