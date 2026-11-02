% Change file of the T5 trial: the constants of the large build (format
% builds and renders). It applies after tex-system.ch. The halfword grows to
% 28 bits, so a memory word has 8 bytes: two 4-byte halves, or four quarters.
% The compiler pads the 40-character pool_name when it fills name_of_file.
@x [1.11] l.390 - large constants
@!mem_max=30000; {greatest index in \TeX's internal |mem| array;
@y
@!mem_max=4000000; {greatest index in \TeX's internal |mem| array;
@z

@x [1.11] l.396
@!buf_size=500; {maximum number of characters simultaneously present in
@y
@!buf_size=200000; {maximum number of characters simultaneously present in
@z

@x [1.11] l.399
@!error_line=72; {width of context lines on terminal error messages}
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@!stack_size=200; {maximum number of simultaneous input sources}
@!max_in_open=6; {maximum number of input files and error insertions that
  can be going on simultaneously}
@!font_max=75; {maximum internal font number; must not exceed |max_quarterword|
  and must be at most |font_base+256|}
@!font_mem_size=20000; {number of words of |font_info| for all fonts}
@!param_size=60; {maximum number of simultaneous macro parameters}
@!nest_size=40; {maximum number of semantic levels simultaneously active}
@!max_strings=3000; {maximum number of strings; must not exceed |max_halfword|}
@!string_vacancies=8000; {the minimum number of characters that should be
@y
@!error_line=79; {width of context lines on terminal error messages}
@!half_error_line=50; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@!stack_size=5000; {maximum number of simultaneous input sources}
@!max_in_open=15; {maximum number of input files and error insertions that
  can be going on simultaneously}
@!font_max=255; {maximum internal font number; must not exceed |max_quarterword|
  and must be at most |font_base+256|}
@!font_mem_size=2000000; {number of words of |font_info| for all fonts}
@!param_size=10000; {maximum number of simultaneous macro parameters}
@!nest_size=500; {maximum number of semantic levels simultaneously active}
@!max_strings=300000; {maximum number of strings; must not exceed |max_halfword|}
@!string_vacancies=90000; {the minimum number of characters that should be
@z

@x [1.11] l.415
@!pool_size=32000; {maximum number of characters in strings, including all
@y
@!pool_size=6000000; {maximum number of characters in strings, including all
@z

@x [1.11] l.419
@!save_size=600; {space for saving values outside of current group; must be
  at most |max_halfword|}
@!trie_size=8000; {space for hyphenation patterns; should be larger for
@y
@!save_size=100000; {space for saving values outside of current group; must be
  at most |max_halfword|}
@!trie_size=1000000; {space for hyphenation patterns; should be larger for
@z

@x [1.11] l.424
@!dvi_buf_size=800; {size of the output buffer; must be a multiple of 8}
@!file_name_size=40; {file names shouldn't be longer than this}
@y
@!dvi_buf_size=16384; {size of the output buffer; must be a multiple of 8}
@!file_name_size=255; {file names shouldn't be longer than this}
@z

@x [1.12] l.443
@d mem_top==30000 {largest index in the |mem| array dumped by \.{INITEX};
@y
@d mem_top==4000000 {largest index in the |mem| array dumped by \.{INITEX};
@z

@x [1.12] l.448
@d hash_size=2100 {maximum number of control sequences; it should be at most
@y
@d hash_size=200000 {maximum number of control sequences; it should be at most
@z

@x [1.12] l.450
@d hash_prime=1777 {a prime number equal to about 85\pct! of |hash_size|}
@d hyph_size=307 {another prime; the number of \.{\\hyphenation} exceptions}
@y
@d hash_prime=169991 {a prime number equal to about 85\pct! of |hash_size|}
@d hyph_size=8191 {another prime; the number of \.{\\hyphenation} exceptions}
@z

@x [8.110] l.2429 - 28-bit halfwords
@d max_halfword==65535 {largest allowable value in a |halfword|}
@y
@d max_halfword==@"FFFFFFF {largest allowable value in a |halfword|}
@z
