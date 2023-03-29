all:
	$(MAKE) -C circuits
	$(MAKE) -C txlib
	$(MAKE) -C client
	$(MAKE) -C gen_test_vectors

clean:
		$(MAKE) -C circuits clean
		$(MAKE) -C txlib clean
		$(MAKE) -C client clean
		$(MAKE) -C cyklone_js clean
		${MAKE} -C gen_test_vectors clean
