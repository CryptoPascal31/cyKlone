all:
	$(MAKE) -C circuits
	$(MAKE) -C txlib
	$(MAKE) -C client

clean:
		$(MAKE) -C circuits clean
		$(MAKE) -C txlib clean
		$(MAKE) -C client clean
