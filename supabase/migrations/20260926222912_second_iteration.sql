-- Additive second iteration. Existing revisions, PDF identities and owner policies remain intact.
alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check(kind in ('notebook','entry','day','activity','paper','annotation','asset','settings','conversation','artifact','label','writing_progress','study'));
create schema if not exists journal_private;
revoke all on schema journal_private from public,anon,authenticated;
create table journal_private.rollout(started_at timestamptz not null default now());
insert into journal_private.rollout default values;

create function journal_private.label_name(t text) returns text language sql immutable set search_path=public as $$
 select lower(trim(regexp_replace(normalize(t,NFKC),'\s+',' ','g')));
$$;
create unique index one_label_name on public.records(owner_id,(data->>'notebookId'),journal_private.label_name(data->>'name')) where kind='label' and deleted_at is null;
create unique index one_writing_day on public.records(owner_id,(data->>'entryId'),(data->>'date')) where kind='writing_progress' and deleted_at is null;
create unique index one_study_day on public.records(owner_id,(data->>'paperId'),(data->>'date')) where kind='study' and deleted_at is null;

create function journal_private.body_words(t text) returns jsonb language plpgsql immutable set search_path=public as $$
begin
 t:=lower(normalize(coalesce(t,''),NFKC));
 t:=regexp_replace(t,$rx$!\[(?:\\.|[^\]])*\]\([^)]*\)$rx$,' ','g');
 t:=regexp_replace(t,$rx$!\[(?:\\.|[^\]])*\]\[[^\]]*\]$rx$,' ','g');
 t:=regexp_replace(t,$rx$\[([^\]]*)\]\[[^\]]*\]$rx$,'\1','g');
 t:=regexp_replace(t,$rx$\[([^\]]*)\]\([^)]*\)$rx$,'\1','g');
 t:=regexp_replace(t,$rx$^\s*\[[^\]]+\]:[^\n]*$rx$,' ','gn');
 t:=regexp_replace(t,$rx$^\s*```[^\n]*$rx$,' ','gn');
 t:=regexp_replace(t,'<[^>]*>',' ','g');
 t:=regexp_replace(t,'(https?://|asset:|annotation:)[^\s)]+',' ','g');
 return coalesce((select jsonb_agg(m[1]) from regexp_matches(t,'[[:alnum:]]+','g') m),'[]'::jsonb);
end $$;
create function journal_private.added_words(baseline jsonb, markdown text) returns integer language sql immutable set search_path=public as $$
 with b as (select value,count(*) n from jsonb_array_elements_text(baseline) group by value),
 c as (select value,count(*) n from jsonb_array_elements_text(journal_private.body_words(markdown)) group by value)
 select coalesce(sum(greatest(0,c.n-coalesce(b.n,0))),0)::integer from c left join b using(value);
$$;

create function journal_private.validate_iteration() returns trigger language plpgsql set search_path=public as $$
declare v text;
begin
 if new.kind in ('label','study','writing_progress') and not(new.data ? 'notebookId') then raise exception 'Notebook required'; end if;
 if new.kind='label' and (coalesce(journal_private.label_name(new.data->>'name'),'')='' or length(new.data->>'name')>80 or coalesce(new.data->>'color','') !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Invalid label'; end if;
 if new.kind='entry' and new.data ? 'labelIds' then
  if jsonb_typeof(new.data->'labelIds')<>'array' then raise exception 'Invalid labels'; end if;
  for v in select jsonb_array_elements_text(new.data->'labelIds') loop
   if not exists(select 1 from records where id=v::uuid and owner_id=new.owner_id and kind='label' and data->>'notebookId'=new.data->>'notebookId') then raise exception 'Label belongs to another notebook'; end if;
  end loop;
 end if;
 if new.kind='study' and (not(new.data ? 'paperId') or coalesce(new.data->>'source','') not in ('writing','time','visit','history')) then raise exception 'Invalid study'; end if;
 if new.kind='activity' and (new.data ? 'minutes' and jsonb_typeof(new.data->'minutes') is distinct from 'number' or jsonb_typeof(new.data->'completed') is distinct from 'boolean' or coalesce(new.data->>'minutes','0') !~ '^\d+$' or coalesce((new.data->>'minutes')::numeric,0)>1440) then raise exception 'Minutes must be an integer from 0 to 1440'; end if;
 if new.kind in ('study','writing_progress') then
  if coalesce(new.data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  perform (new.data->>'date')::date;
 end if;
 if new.kind='writing_progress' then
  if not exists(select 1 from records where id=(new.data->>'entryId')::uuid and kind='entry' and owner_id=new.owner_id and data->>'notebookId'=new.data->>'notebookId') or jsonb_typeof(new.data->'baseline') is distinct from 'array' or coalesce(new.data->>'maxAdded','') !~ '^\d+$' then raise exception 'Invalid writing progress'; end if;
 end if;
 return new;
end $$;
create trigger validate_iteration before insert or update on public.records for each row execute function journal_private.validate_iteration();

-- The former implementation stays available only to owner-checked RPC wrappers.
alter function public.save_record(uuid,text,jsonb,integer,timestamptz) set schema journal_private;
revoke all on function journal_private.save_record(uuid,text,jsonb,integer,timestamptz) from public,anon,authenticated;

create function journal_private.study_day(p_owner uuid,p_notebook uuid,p_paper uuid,p_date date,p_source text) returns void language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from records where owner_id=p_owner and kind='study' and deleted_at is null and data->>'paperId'=p_paper::text and data->>'date'=p_date::text) then
  insert into records(id,owner_id,kind,data) values(gen_random_uuid(),p_owner,'study',jsonb_build_object('notebookId',p_notebook,'paperId',p_paper,'date',p_date,'source',p_source));
 end if;
end $$;
create function public.save_entry(p_id uuid,p_data jsonb,p_revision integer,p_writing_date date default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; prior records; progress records; activity records; baseline jsonb; added integer; total integer; zone text; d date; start_day date;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select coalesce(data->>'timezone','America/Los_Angeles') into zone from records where owner_id=auth.uid() and kind='settings' and deleted_at is null;
 zone:=coalesce(zone,'America/Los_Angeles'); d:=coalesce(p_writing_date,(now() at time zone zone)::date);
 select (started_at at time zone zone)::date into start_day from journal_private.rollout;
 if d> (now() at time zone zone)::date or d<start_day then raise exception 'Writing day is outside the tracking period'; end if;
 select * into prior from records where id=p_id and owner_id=auth.uid();
 result:=journal_private.save_record(p_id,'entry',p_data,p_revision,null);
 if (result->>'conflict')::boolean then return result; end if;
 -- Titles, labels, and retries never create new writing credit.
 if prior.data->>'markdown' is not distinct from p_data->>'markdown' then return result; end if;
 select * into progress from records where owner_id=auth.uid() and kind='writing_progress' and deleted_at is null and data->>'entryId'=p_id::text and data->>'date'=d::text;
 baseline:=coalesce(progress.data->'baseline',journal_private.body_words(prior.data->>'markdown'));
 added:=greatest(coalesce((progress.data->>'maxAdded')::integer,0),journal_private.added_words(baseline,p_data->>'markdown'));
 if progress.id is null then
  insert into records(id,owner_id,kind,data) values(gen_random_uuid(),auth.uid(),'writing_progress',jsonb_build_object('entryId',p_id,'notebookId',p_data->>'notebookId','date',d,'baseline',baseline,'maxAdded',added));
 else
  update records set data=jsonb_set(data,'{maxAdded}',to_jsonb(added)),revision=revision+1,updated_at=now() where id=progress.id;
 end if;
 select coalesce(sum((data->>'maxAdded')::integer),0) into total from records where owner_id=auth.uid() and kind='writing_progress' and deleted_at is null and data->>'notebookId'=p_data->>'notebookId' and data->>'date'=d::text;
 if total>=5 then
  select * into activity from records where owner_id=auth.uid() and kind='activity' and deleted_at is null and data->>'notebookId'=p_data->>'notebookId' and data->>'date'=d::text;
  if activity.id is null then
   insert into records(id,owner_id,kind,data) values(gen_random_uuid(),auth.uid(),'activity',jsonb_build_object('date',d,'notebookId',p_data->>'notebookId','completed',true,'minutes',0,'provenance','writing','completedAt',now()));
  elsif not (activity.data->>'completed')::boolean then
   update records set data=data||jsonb_build_object('completed',true,'provenance','writing','completedAt',now()),revision=revision+1,updated_at=now() where id=activity.id;
  end if;
 end if;
 if p_data->>'paperId' is not null then perform journal_private.study_day(auth.uid(),(p_data->>'notebookId')::uuid,(p_data->>'paperId')::uuid,d,'writing'); end if;
 return result;
end $$;

create function public.save_record(p_id uuid,p_kind text,p_data jsonb,p_revision integer default 0,p_deleted_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare old records;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if p_kind in ('writing_progress','study') then raise exception 'Use the journal tracking operations'; end if;
 if p_kind='entry' and p_deleted_at is null then
  select * into old from records where id=p_id;
  -- Restoring trash does not count as writing.
  if old.deleted_at is null then return public.save_entry(p_id,p_data,p_revision,null); end if;
 end if;
 if p_kind='activity' then
  if p_deleted_at is not null then raise exception 'Daily activity history cannot be deleted'; end if;
  select * into old from records where id=p_id and owner_id=auth.uid();
  if old.id is not null and (old.data->>'date' is distinct from p_data->>'date' or old.data->>'notebookId' is distinct from p_data->>'notebookId') then raise exception 'Activity identity cannot change'; end if;
  p_data:=p_data-'completedAt'-'provenance'||jsonb_build_object('completed',coalesce((old.data->>'completed')::boolean,false));
  if old.data ? 'completedAt' then p_data:=p_data||jsonb_build_object('completedAt',old.data->'completedAt'); end if;
  if old.data ? 'provenance' then p_data:=p_data||jsonb_build_object('provenance',old.data->'provenance'); end if;
 end if;
 if p_kind='label' then
  select * into old from records where id=p_id and owner_id=auth.uid();
  if old.id is not null and old.data->>'notebookId' is distinct from p_data->>'notebookId' then raise exception 'Label notebook cannot change'; end if;
 end if;
 if p_kind='notebook' then
  select * into old from records where id=p_id and owner_id=auth.uid();
  p_data:=p_data||jsonb_build_object('research',coalesce((old.data->>'research')::boolean,(p_data->>'research')::boolean,false));
 end if;
 if p_kind='settings' then p_data:=p_data||'{"theme":"dark"}'::jsonb; end if;
 return journal_private.save_record(p_id,p_kind,p_data,p_revision,p_deleted_at);
end $$;
create function public.record_study(p_notebook uuid,p_paper uuid,p_date date default null) returns void language plpgsql security definer set search_path=public as $$
declare zone text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from records where owner_id=auth.uid() and kind='notebook' and id=p_notebook and deleted_at is null) or not exists(select 1 from records where owner_id=auth.uid() and kind='paper' and id=p_paper and deleted_at is null) then raise exception 'Invalid study reference'; end if;
 select data->>'timezone' into zone from records where owner_id=auth.uid() and kind='settings' and deleted_at is null;
 perform journal_private.study_day(auth.uid(),p_notebook,p_paper,coalesce(p_date,(now() at time zone coalesce(zone,'America/Los_Angeles'))::date),'visit');
end $$;
-- Daily time is a CAS update; paper association and minutes commit together.
create function public.save_time(p_id uuid,p_notebook uuid,p_date date,p_minutes integer,p_revision integer,p_paper uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare old records; result jsonb;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into old from records where owner_id=auth.uid() and kind='activity' and deleted_at is null and data->>'notebookId'=p_notebook::text and data->>'date'=p_date::text;
 if old.id is not null and old.id<>p_id then return jsonb_build_object('conflict',true,'record',to_jsonb(old)-'owner_id'); end if;
 result:=public.save_record(p_id,'activity',coalesce(old.data,'{}')||jsonb_build_object('date',p_date,'notebookId',p_notebook,'minutes',p_minutes),p_revision,null);
 if not (result->>'conflict')::boolean and p_paper is not null then perform journal_private.study_day(auth.uid(),p_notebook,p_paper,p_date,'time'); end if;
 return result;
end $$;

-- Retain legacy manual completion and repair presentation preferences without changing IDs.
insert into record_versions(record_id,revision,owner_id,data)
 select id,revision,owner_id,data from records where (kind='notebook' and lower(trim(data->>'name'))='comp programming') or (kind='settings' and data->>'theme'='light');
update records set data=data||'{"icon":"code"}',revision=revision+1 where kind='notebook' and lower(trim(data->>'name'))='comp programming';
update records set data=(data-'mainColor')||'{"theme":"dark"}',revision=revision+1 where kind='settings' and data->>'theme'='light';
update records set data=data||jsonb_build_object('minutes',0,'provenance','manual') where kind='activity' and not(data ? 'minutes');

-- Only revisions with an actual content change prove a study day. Migration
-- consolidation itself and date labels alone are not evidence of study.
do $$
declare r record;
begin
 for r in
  with history as (
   select record_id,revision,data,saved_at from record_versions
   union all select id,revision,data,updated_at from records where kind='entry'
  ), changes as (
   select h.*,lag(data->>'markdown') over(partition by record_id order by revision) previous,
     lag(revision) over(partition by record_id order by revision) previous_revision,
     lag(saved_at) over(partition by record_id order by revision) changed_at from history h
  )
  select distinct e.owner_id,e.data->>'notebookId' notebook,e.data->>'paperId' paper,
    (c.changed_at at time zone coalesce(s.data->>'timezone','America/Los_Angeles'))::date studied
  from changes c join records e on e.id=c.record_id
  left join records s on s.owner_id=e.owner_id and s.kind='settings' and s.deleted_at is null
  where e.kind='entry' and e.data ? 'paperId' and c.previous_revision is not null
    and c.data->>'markdown' is distinct from c.previous
    and not(c.data ? 'mergedInto') and c.data->>'markdown' !~ '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' and c.data->>'markdown' not like '%'||E'\n\n---\n\n## '||'%'
 loop perform journal_private.study_day(r.owner_id,r.notebook::uuid,r.paper::uuid,r.studied,'history'); end loop;
end $$;

revoke all on all functions in schema journal_private from public,anon,authenticated;
revoke all on function public.save_entry(uuid,jsonb,integer,date),public.save_record(uuid,text,jsonb,integer,timestamptz),public.record_study(uuid,uuid,date),public.save_time(uuid,uuid,date,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_entry(uuid,jsonb,integer,date),public.save_record(uuid,text,jsonb,integer,timestamptz),public.record_study(uuid,uuid,date),public.save_time(uuid,uuid,date,integer,integer,uuid) to authenticated;

create or replace function public.restore_records(p_records jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; prior records; incoming jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if jsonb_array_length(p_records)>20000 then raise exception 'Archive too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  for r in select value from jsonb_array_elements(p_records) order by case value->>'kind' when 'notebook' then 0 when 'paper' then 1 when 'annotation' then 2 when 'label' then 3 when 'entry' then 4 else 5 end loop
    if r->>'kind' in ('asset','settings') then raise exception 'Assets and settings require separate handling'; end if;
    incoming:=r->'data';
    if r->>'kind'='study' and exists(select 1 from records where owner_id=auth.uid() and kind='study' and deleted_at is null and data->>'paperId'=incoming->>'paperId' and data->>'date'=incoming->>'date') then continue; end if;
    if r->>'kind'='notebook' and not(incoming ? 'research') then incoming:=incoming||jsonb_build_object('research',incoming->>'icon'='science'); end if;
    if r->>'kind'='entry' and r->>'deleted_at' is null and not(incoming ? 'mergedInto') then
      select * into prior from records where owner_id=auth.uid() and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and
       (case when incoming->>'paperId' is not null then data->>'paperId'=incoming->>'paperId' else data->>'paperId' is null and data->>'notebookId'=incoming->>'notebookId' and data->>'date'=incoming->>'date' end) limit 1;
      if found then
       insert into record_versions(record_id,revision,owner_id,data) values(prior.id,prior.revision,prior.owner_id,prior.data);
       if prior.data->>'markdown' is distinct from incoming->>'markdown' and length(trim(incoming->>'markdown'))>0 then
        update records set data=jsonb_set(data,'{baseline}',(data->'baseline')||journal_private.body_words(E'\n\n---\n\n## Restored notes\n\n'||(incoming->>'markdown'))) where owner_id=auth.uid() and kind='writing_progress' and data->>'entryId'=prior.id::text;
        update records set data=jsonb_set(data,'{markdown}',to_jsonb((data->>'markdown')||E'\n\n---\n\n## Restored notes\n\n'||(incoming->>'markdown'))),revision=revision+1,updated_at=now() where id=prior.id;
       else update records set revision=revision+1 where id=prior.id;end if;
       incoming:=incoming||jsonb_build_object('mergedInto',prior.id);
      end if;
    end if;
    insert into records(id,owner_id,kind,data,deleted_at) values((r->>'id')::uuid,auth.uid(),r->>'kind',incoming,(r->>'deleted_at')::timestamptz);
  end loop;

end $$;

update public.records set data=data||jsonb_build_object('research',data->>'icon'='science') where kind='notebook' and not(data ? 'research');
