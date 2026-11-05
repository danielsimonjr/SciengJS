% Change file of the T6 trial: the system dependencies of the WASM build.
% It applies to tex.web after etex.ch. The build is not called TeX or e-TeX:
% the banner names the engine. \eTeXversion and \eTeXrevision keep the
% values of etex.ch.
@x [1] m.2 - the name of the build
@d eTeX_banner=='This is e-TeX, Version 3.141592653',eTeX_version_string
@y
@d eTeX_banner=='This is SET, Version 3.141592653',eTeX_version_string
@z

@x [2.23] l.737 - each 8-bit code is a valid character (files have tabs and UTF-8)
for i:=0 to @'37 do xchr[i]:=' ';
for i:=@'177 to @'377 do xchr[i]:=' ';
@y
for i:=0 to @'37 do xchr[i]:=chr(i);
for i:=@'177 to @'377 do xchr[i]:=chr(i);
@z

@x [3.35] l.1036 - no non-local goto: the host stops the program
  begin write_ln(term_out,'Buffer size exceeded!'); goto final_end;
@y
  begin write_ln(term_out,'Buffer size exceeded!'); host_exit(1);
@z

@x [6.81] l.1871 - jump_out closes the files, then the host stops the program
@<Error hand...@>=
procedure jump_out;
begin goto end_of_TEX;
end;
@y
@<Error hand...@>=
procedure host_exit(@!code:integer); external;
procedure jump_out;
begin close_files_and_terminate; ready_already:=0; host_exit(history);
end;
@z

@x [6.96] l.2118 - etex.ch counts the nesting of scan_expr (a counter that it expects from the system change file)
@!interrupt:integer; {should \TeX\ pause for instructions?}
@!OK_to_interrupt:boolean; {should interrupts be observed?}

@ @<Set init...@>=
interrupt:=0; OK_to_interrupt:=true;
@y
@!interrupt:integer; {should \TeX\ pause for instructions?}
@!OK_to_interrupt:boolean; {should interrupts be observed?}
@!expand_depth_count:integer; {the nesting of |scan_expr|}

@ @d expand_depth=10000 {the greatest nesting of |scan_expr|}

@<Set init...@>=
interrupt:=0; OK_to_interrupt:=true; expand_depth_count:=0;
@z
