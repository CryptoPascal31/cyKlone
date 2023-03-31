#/bin/bash

rm -f work*.yaml work*.json

for i in $(seq 6); do
    kda gen -t work.tkpl -d testnet_data.yaml -o work-$i.yaml
done

kda sign work*.yaml -k tmp.key.yaml

for i in $(seq 6); do
  kda send work-$i.json | jq
done
