all: install test-vectors.pact

install:
	yarn install

copy: test-vectors.pact
	cp test-vectors.pact ../pact/tests

test-vectors.pact: index.js
	yarn run gen-tests

clean:
	rm -rf node_modules
	rm -f merkle_tree.json
	rm -f test-vectors.pact
