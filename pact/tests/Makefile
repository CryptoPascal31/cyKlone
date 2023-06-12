PACT=pact

#OUT_FILTER= | grep -v Warning
OUT_FILTER = 

all: tests benchmarks

tests:
	${PACT} cyKlone-short.repl ${OUT_FILTER}
	${PACT} cyKlone.repl ${OUT_FILTER}
	${PACT} cyKlone-relay.repl ${OUT_FILTER}
	${PACT} cyKlone-work-gas-station.repl ${OUT_FILTER}

benchmarks:
	${PACT} benchmarks.repl ${OUT_FILTER}
