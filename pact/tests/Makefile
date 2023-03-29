PACT=pact
OUT_FILTER=grep -v Warning

all: tests benchmarks

tests:
	${PACT} cyKlone.repl | ${OUT_FILTER}
	${PACT} cyKlone-relay.repl | ${OUT_FILTER}
	${PACT} cyKlone-work-gas-station.repl | ${OUT_FILTER}

benchmarks:
	${PACT} benchmarks.repl | ${OUT_FILTER}
