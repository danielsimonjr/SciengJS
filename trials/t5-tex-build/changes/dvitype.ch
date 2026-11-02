% Change file of the T5 trial for dvitype.web: no non-local goto.
@x [1.8] l.182 - jump_out: the host stops the program
@p procedure jump_out;
begin goto final_end;
end;
@y
@p procedure host_exit(@!code:integer); external;
procedure jump_out;
begin host_exit(1);
end;
@z
