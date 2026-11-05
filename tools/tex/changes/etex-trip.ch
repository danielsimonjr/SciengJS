% Change file of the T6 trial: the e-TRIP settings (etripman.tex, Appendix A,
% step 2). It applies after the trip change file of T5 (tex-trip.ch), which
% sets the constants of tripman.tex. e-TRIPTEX needs max_strings >= 3200 and
% pool_size >= 32000. The pool of e-TeX is longer than the pool of TeX, so
% pool_size must also hold the pool and string_vacancies (8000).
@x [1.11] l.411 - more strings for the primitives of e-TeX
@!max_strings=3000; {maximum number of strings; must not exceed |max_halfword|}
@y
@!max_strings=3200; {maximum number of strings; must not exceed |max_halfword|}
@z

@x [1.11] l.415 - more pool space for the strings of e-TeX
@!pool_size=32000; {maximum number of characters in strings, including all
@y
@!pool_size=40000; {maximum number of characters in strings, including all
@z
