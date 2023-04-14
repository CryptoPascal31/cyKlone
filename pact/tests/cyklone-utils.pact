(module cyKlone-utils G
  (defcap G() true)
  (defun repeat-N-work (n:integer)
    (let ((_work (lambda (_) (free.cyKlone-v0-multipool.work))))
      (map (_work) (enumerate 1 n))))
)
