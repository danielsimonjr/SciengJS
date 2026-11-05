% Change file of the T6 trial: the utility primitives that the LaTeX kernel
% needs. The format build needs \expanded, \filesize and \pdfstrcmp. The
% \everyjob code of the L3 kernel needs \creationdate and \shellescape at the
% start of each job. This file applies after etex.ch and the other change
% files of the engine. Each primitive follows the published description of
% its behaviour; docs/analysis/t6-etex-build.md gives the source of each.
% The primitives exist in the extended mode of e-TeX only, as the primitives
% of etex.ch do. Their names come from the list of the L3 kernel (l3names).
%   \expanded     pdfTeX user manual (pdftex-t.tex, 2023), \expanded
%   \filesize     pdfTeX user manual, \pdffilesize; LaTeX kernel latex.ltx
%   \pdfstrcmp    pdfTeX user manual, \pdfstrcmp
%   \creationdate pdfTeX user manual, \pdfcreationdate (the PDF date form)
%   \shellescape  pdfTeX user manual, \pdfshellescape (0: no shell commands)
@x [25] m.367 - \expanded is a third chr code of expand_after
expand_after:if cur_chr=0 then @<Expand the token after the next token@>
  else @<Negate a boolean conditional and |goto reswitch|@>;
@y
expand_after:if cur_chr=0 then @<Expand the token after the next token@>
  else if cur_chr=1 then @<Negate a boolean conditional and |goto reswitch|@>
  else @<Expand the balanced text of \.{\\expanded}@>;
@z

@x [27] m.468 - \filesize is a convert code
@d etex_convert_codes=etex_convert_base+1 {end of \eTeX's command codes}
@y
@d file_size_code=etex_convert_base+1 {command code for \.{\\filesize}}
@d str_cmp_code=etex_convert_base+2 {command code for \.{\\pdfstrcmp}}
@d creation_date_code=etex_convert_base+3 {command code for \.{\\creationdate}}
@d etex_convert_codes=etex_convert_base+4 {end of \eTeX's command codes}
@z

@x [27] m.469
  eTeX_revision_code: print_esc("eTeXrevision");
@y
  eTeX_revision_code: print_esc("eTeXrevision");
  file_size_code: print_esc("filesize");
  str_cmp_code: print_esc("pdfstrcmp");
  creation_date_code: print_esc("creationdate");
@z

@x [27] m.471
eTeX_revision_code: do_nothing;
@y
eTeX_revision_code, creation_date_code: do_nothing;
file_size_code: begin scan_expanded_text; find_file_size;
  end;
str_cmp_code: compare_texts;
@z

@x [27] m.472
eTeX_revision_code: print(eTeX_revision);
@y
eTeX_revision_code: print(eTeX_revision);
file_size_code: if file_size_value>=0 then print_int(file_size_value);
str_cmp_code: print_int(str_cmp_value);
creation_date_code: begin print("D:"); print_int(sys_year); print_two(sys_month);
  print_two(sys_day); print_two(sys_time div 60); print_two(sys_time mod 60);
  print("00Z");
  end;
@z

@x [27] m.473 - the procedures that need scan_toks follow it
scan_toks:=p;
end;
@y
scan_toks:=p;
end;
@#
@<Declare the procedures of the utility primitives@>@;
@z

@x [53a] - the primitives of the utility change file
primitive("unless",expand_after,1);@/
@!@:unless_}{\.{\\unless} primitive@>
@y
primitive("unless",expand_after,1);@/
@!@:unless_}{\.{\\unless} primitive@>
primitive("expanded",expand_after,expanded_code);@/
@!@:expanded_}{\.{\\expanded} primitive@>
primitive("filesize",convert,file_size_code);@/
@!@:file_size_}{\.{\\filesize} primitive@>
primitive("pdfstrcmp",convert,str_cmp_code);@/
@!@:pdf_str_cmp_}{\.{\\pdfstrcmp} primitive@>
primitive("creationdate",convert,creation_date_code);@/
@!@:creation_date_}{\.{\\creationdate} primitive@>
primitive("shellescape",char_given,0);@/
@!@:shell_escape_}{\.{\\shellescape} primitive@>
@z

@x [53a]
@ @<Cases of |expandafter| for |print_cmd_chr|@>=
else print_esc("unless")
@y
@ @<Cases of |expandafter| for |print_cmd_chr|@>=
else if chr_code=1 then print_esc("unless")
else print_esc("expanded")

@ The utility primitives.

\.{\\expanded}\<general text> expands to the tokens of the balanced text,
expanded as for \.{\\message}. A parameter character in the text stays one
token, and a \.{\\protected} macro is not expanded (pdf\TeX\ user manual,
section ``Macro programming'').

\.{\\filesize}\<general text> expands to the size in bytes of the file whose
name is the expanded text, or to nothing if the file cannot be opened
(pdf\TeX\ user manual, \.{\\pdffilesize}).

\.{\\pdfstrcmp}\<general text>\<general text> expands to \.0 if the two
expanded texts are the same string, to \.{-1} if the first string ranks
before the second, and to \.1 otherwise (pdf\TeX\ user manual).

\.{\\creationdate} expands to the date of the start of the run in the form
\.{D:}$YYYYMMDDHHmmSS$\.Z of the \.{\\pdfcreationdate} of the pdf\TeX\ user
manual. The date is |sys_year|, |sys_month|, |sys_day| and |sys_time|; the
build gives no clock, so the date is the one of |fix_date_and_time|.

\.{\\shellescape} is the read-only integer of \.{\\pdfshellescape} in the
pdf\TeX\ user manual: 0 when \.{\\write18} is off. The build has no
\.{\\write18}, so \.{\\shellescape} is the constant 0, as after
\.{\\chardef\\shellescape=0}.

@d expanded_code=2 {|chr_code| of \.{\\expanded} in |expand_after|}

@<Declare \eTeX\ procedures for ex...@>=
procedure@?scan_expanded_text; forward;@t\2@>@/
procedure@?find_file_size; forward;@t\2@>@/
procedure@?compare_texts; forward;@t\2@>

@ The expansion of \.{\\expanded} puts the expanded text back into the input,
so the tokens are read again.

@<Expand the balanced text of \.{\\expanded}@>=
begin scan_expanded_text;
if link(temp_head)<>null then back_list(link(temp_head));
end

@ The procedure |scan_expanded_text| reads a general text with expansion,
as |scan_toks(false,true)| does. The token list begins at |link(temp_head)|.
The procedure keeps |scanner_status|, |warning_index| and |def_ref|, because
it can run inside |scan_toks|.

@<Declare the procedures of the utility primitives@>=
procedure scan_expanded_text;
var s:normal..absorbing; {to save |scanner_status|}
@!w:pointer; {to save |warning_index|}
@!d:pointer; {to save |def_ref|}
@!t:pointer; {tail of the token list}
begin s:=scanner_status; w:=warning_index; d:=def_ref;
t:=scan_toks(false,true);
link(temp_head):=link(def_ref); free_avail(def_ref);
scanner_status:=s; warning_index:=w; def_ref:=d;
end;

@ The procedure |find_file_size| reads the token list at |link(temp_head)|
as a file name and counts the bytes of the file.

@<Glob...@>=
@!file_size_file:byte_file; {the file that \.{\\filesize} reads}
@!file_size_value:integer; {the size in bytes, or $-1$}

@ The procedure |list_to_pool| writes the characters of a token list at the
end of |str_pool|, as \.{\\detokenize} shows them, and frees the list. The
caller removes the characters again with |pool_ptr:=b|.

@<Declare the procedures of the utility primitives@>=
procedure list_to_pool(@!p:pointer);
var old_setting:0..max_selector; {holds |selector| setting}
begin old_setting:=selector; selector:=new_string;
show_token_list(p,null,pool_size-pool_ptr); selector:=old_setting;
flush_list(p);
end;

@ @<Declare the procedures of the utility primitives@>=
procedure find_file_size;
var b:pool_pointer; {start of the file name in |str_pool|}
@!k:integer; {length of the file name}
@!j:integer; {index into |name_of_file|}
begin b:=pool_ptr; list_to_pool(link(temp_head));
k:=pool_ptr-b;
if k>file_name_size then k:=file_name_size;
for j:=1 to k do name_of_file[j]:=xchr[so(str_pool[b+j-1])];
for j:=k+1 to file_name_size do name_of_file[j]:=' ';
name_length:=k; pool_ptr:=b;
file_size_value:=-1;
if b_open_in(file_size_file) then
  begin file_size_value:=0;
  while not eof(file_size_file) do
    begin incr(file_size_value); get(file_size_file);
    end;
  b_close(file_size_file);
  end;
end;

@ The procedure |compare_texts| reads both texts before it writes them to
|str_pool|, because the expansion of the second text can make new strings.

@<Glob...@>=
@!str_cmp_value:integer; {the result of \.{\\pdfstrcmp}}

@ @<Declare the procedures of the utility primitives@>=
procedure compare_texts;
var p,@!q:pointer; {the two token lists}
@!b,@!m:pool_pointer; {starts of the two strings in |str_pool|}
@!j,@!k:pool_pointer; {indices into the two strings}
begin scan_expanded_text; p:=link(temp_head);
scan_expanded_text; q:=link(temp_head);
b:=pool_ptr; list_to_pool(p); m:=pool_ptr; list_to_pool(q);
j:=b; k:=m; str_cmp_value:=0;
while (str_cmp_value=0)and(j<m)and(k<pool_ptr) do
  begin if str_pool[j]<str_pool[k] then str_cmp_value:=-1
  else if str_pool[j]>str_pool[k] then str_cmp_value:=1;
  incr(j); incr(k);
  end;
if str_cmp_value=0 then
  if j<m then str_cmp_value:=1
  else if k<pool_ptr then str_cmp_value:=-1;
pool_ptr:=b;
end;
@z
