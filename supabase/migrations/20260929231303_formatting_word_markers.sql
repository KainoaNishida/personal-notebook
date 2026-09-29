-- Formatting markers are not new body words. Preserve existing earned progress.
create or replace function journal_private.body_words(t text) returns jsonb language plpgsql immutable set search_path=public as $$
begin
 t:=lower(normalize(coalesce(t,''),NFKC));
 t:=regexp_replace(t,$rx$!\[(?:\\.|[^\]])*\]\([^)]*\)$rx$,' ','g');
 t:=regexp_replace(t,$rx$!\[(?:\\.|[^\]])*\]\[[^\]]*\]$rx$,' ','g');
 t:=regexp_replace(t,$rx$\[([^\]]*)\]\[[^\]]*\]$rx$,'\1','g');
 t:=regexp_replace(t,$rx$\[([^\]]*)\]\([^)]*\)$rx$,'\1','g');
 t:=regexp_replace(t,$rx$^\s*\[[^\]]+\]:[^\n]*$rx$,' ','gn');
 t:=regexp_replace(t,$rx$^\s*```[^\n]*$rx$,' ','gn');
 t:=regexp_replace(t,$rx$^[ \t]*(?:>[ \t]*)*(?:[0-9]+[.)][ \t]+|[-+*][ \t]+\[[ xX]\][ \t]+)$rx$,'','gn');
 t:=regexp_replace(t,'<[^>]*>',' ','g');
 t:=regexp_replace(t,'(https?://|asset:|annotation:)[^\s)]+',' ','g');
 return coalesce((select jsonb_agg(m[1]) from regexp_matches(t,'[[:alnum:]]+','g') m),'[]'::jsonb);
end $$;
