% Change file of the T5 trial: the system dependencies of the WASM build.
% It applies to an unchanged tex.web. The build is not called TeX: the
% banner gives another name of the same length (tex.web section 2).
@x [1.2] l.193 - the name of the build
@d banner=='This is TeX, Version 3.141592653' {printed when \TeX\ starts}
@y
@d banner=='This is SET, Version 3.141592653' {printed when the build starts}
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
