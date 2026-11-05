% Change file of the T5 trial: the constants of the trip test version
% (tripman, Appendix A, step 2). It applies after tex-system.ch.
@x [1.9] l.309 - statistics on
@d stat==@{ {change this to `$\\{stat}\equiv\null$' when gathering
  usage statistics}
@d tats==@t@>@} {change this to `$\\{tats}\equiv\null$' when gathering
  usage statistics}
@y
@d stat== {statistics are on for the trip test}
@d tats==
@z

@x [1.11] l.390 - trip constants
@!mem_max=30000; {greatest index in \TeX's internal |mem| array;
@y
@!mem_max=3000; {greatest index in \TeX's internal |mem| array;
@z

@x [1.11] l.393
@!mem_min=0; {smallest index in \TeX's internal |mem| array;
@y
@!mem_min=1; {smallest index in \TeX's internal |mem| array;
@z

@x [1.11] l.399
@!error_line=72; {width of context lines on terminal error messages}
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@y
@!error_line=64; {width of context lines on terminal error messages}
@!half_error_line=32; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@!max_print_line=72; {width of longest text lines output; should be at least 60}
@z

@x [1.12] l.441
@d mem_bot=0 {smallest index in the |mem| array dumped by \.{INITEX};
@y
@d mem_bot=1 {smallest index in the |mem| array dumped by \.{INITEX};
@z

@x [1.12] l.443
@d mem_top==30000 {largest index in the |mem| array dumped by \.{INITEX};
@y
@d mem_top==3000 {largest index in the |mem| array dumped by \.{INITEX};
@z
