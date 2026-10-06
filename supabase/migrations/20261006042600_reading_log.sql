-- Reading sessions reuse the entry envelope, revision history, and atomic
-- writing-credit transaction. Multiple sessions may share a notebook/day.
-- Existing daily notes stay intact and are displayed as Earlier notes.
drop index public.one_daily_entry;
create unique index one_daily_entry on public.records(owner_id,(data->>'notebookId'),(data->>'date'))
 where kind='entry' and deleted_at is null and data->>'paperId' is null and not(data ? 'mergedInto') and not(data ? 'reading');

-- Pin the notebook layout once, so a later rename never changes its behavior.
insert into public.record_versions(record_id,revision,owner_id,data)
 select id,revision,owner_id,data from public.records where kind='notebook' and not(data ? 'reading');
update public.records set data=data||jsonb_build_object('reading',lower(trim(data->>'name'))='reading' and not coalesce((data->>'research')::boolean,false)),revision=revision+1
 where kind='notebook' and not(data ? 'reading');

create function journal_private.validate_reading() returns trigger language plpgsql set search_path=public as $$
begin
 if new.kind='notebook' then
  if tg_op='UPDATE' and old.data ? 'reading' then new.data:=new.data||jsonb_build_object('reading',old.data->'reading'); end if;
  if new.data ? 'reading' and jsonb_typeof(new.data->'reading') is distinct from 'boolean' then raise exception 'Invalid reading layout'; end if;
  if new.data->>'reading'='true' and new.data->>'research'='true' then raise exception 'Choose one notebook layout'; end if;
 end if;
 if new.kind<>'entry' then return new; end if;
 if tg_op='UPDATE' and (old.data ? 'reading') is distinct from (new.data ? 'reading') then raise exception 'Entry type cannot change'; end if;
 if not(new.data ? 'reading') then return new; end if;
 if jsonb_typeof(new.data->'reading') is distinct from 'object' or new.data ? 'paperId' then raise exception 'Invalid reading session'; end if;
 if not exists(select 1 from records where id=(new.data->>'notebookId')::uuid and owner_id=new.owner_id and kind='notebook' and data->>'reading'='true' and coalesce(data->>'research','false')<>'true') then raise exception 'Reading sessions require a reading notebook'; end if;
 if coalesce(length(trim(new.data->>'title')),0)=0 or jsonb_typeof(new.data->'title') is distinct from 'string' or length(new.data->>'title')>300 then raise exception 'Book title is required (300 characters maximum)'; end if;
 if jsonb_typeof(new.data->'reading'->'minutes') is distinct from 'number' or coalesce(new.data->'reading'->>'minutes','') !~ '^\d+$' or (new.data->'reading'->>'minutes')::numeric not between 1 and 1440 then raise exception 'Reading minutes must be a whole number from 1 to 1440'; end if;
 if jsonb_typeof(new.data->'reading'->'author') is distinct from 'string' or length(new.data->'reading'->>'author')>200 then raise exception 'Author must be at most 200 characters'; end if;
 if coalesce(new.data->'reading'->>'createdAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' then raise exception 'Invalid reading creation time'; end if;
 perform (new.data->'reading'->>'createdAt')::timestamptz;
 if tg_op='UPDATE' and old.data->'reading'->>'createdAt' is distinct from new.data->'reading'->>'createdAt' then raise exception 'Reading session identity cannot change'; end if;
 return new;
end $$;
revoke all on function journal_private.validate_reading() from public,anon,authenticated;
create trigger validate_reading before insert or update on public.records for each row execute function journal_private.validate_reading();

create or replace function journal_private.save_record(p_id uuid,p_kind text,p_data jsonb,p_revision integer default 0,p_deleted_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare old records; saved records;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_kind='day' then raise exception 'Reload the journal to edit reflections in Life'; end if;
  if p_data ? 'mergedInto' then raise exception 'Consolidated originals are read-only'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into old from records where id=p_id for update;
  if found then
    if old.owner_id<>auth.uid() then raise exception 'Owner access required' using errcode='42501'; end if;
    if old.revision<>p_revision then return jsonb_build_object('conflict',true,'record',to_jsonb(old)-'owner_id'); end if;
    if old.kind<>p_kind then raise exception 'Entity kind cannot change'; end if;
    if old.deleted_at is not null and old.deleted_at < now()-interval '30 days' then raise exception 'Trash retention has expired'; end if;
    if old.data ? 'mergedInto' then raise exception 'Open the consolidated note to continue editing'; end if;
    if old.kind='entry' and ((old.data->>'date' is distinct from p_data->>'date' and not(old.data ? 'reading' and p_data ? 'reading')) or old.data->>'notebookId' is distinct from p_data->>'notebookId' or old.data->>'paperId' is distinct from p_data->>'paperId') then raise exception 'Entry identity and date cannot change'; end if;
    if old.kind='paper' and old.data-'title' <> p_data-'title' then raise exception 'PDF identity is immutable'; end if;
    if old.kind='paper' and coalesce(length(trim(p_data->>'title')),0)=0 then raise exception 'Paper title required'; end if;
    if old.kind in ('asset','annotation') and old.data<>p_data then raise exception 'Source records are immutable; create a new source'; end if;
    insert into record_versions(record_id,revision,owner_id,data) values(old.id,old.revision,old.owner_id,old.data);
    update records set data=p_data,revision=revision+1,updated_at=now(),deleted_at=p_deleted_at where id=p_id returning * into saved;
  else
    if p_revision<>0 then raise exception 'Record no longer exists'; end if;
    if p_kind='entry' and p_deleted_at is null and not(p_data ? 'reading') then
      select * into old from records where owner_id=auth.uid() and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and
       (case when p_data->>'paperId' is not null then data->>'paperId'=p_data->>'paperId' else data->>'paperId' is null and not(data ? 'reading') and data->>'notebookId'=p_data->>'notebookId' and data->>'date'=p_data->>'date' end) limit 1;
      if found then return jsonb_build_object('conflict',true,'record',to_jsonb(old)-'owner_id'); end if;
    end if;
    insert into records(id,owner_id,kind,data,deleted_at) values(p_id,auth.uid(),p_kind,p_data,p_deleted_at) returning * into saved;
  end if;
  return jsonb_build_object('conflict',false,'record',to_jsonb(saved)-'owner_id');
end $$;

-- Imports retain each session, even for the same book and day.
create or replace function public.restore_records(p_records jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; prior records; incoming jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if jsonb_array_length(p_records)>20000 then raise exception 'Archive too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  for r in select value from jsonb_array_elements(p_records) order by case value->>'kind' when 'notebook' then 0 when 'paper' then 1 when 'annotation' then 2 when 'label' then 3 when 'entry' then 4 else 5 end loop
    if r->>'kind' in ('asset','settings') then raise exception 'Assets and settings require separate handling'; end if;
    incoming:=r->'data';
    if r->>'kind'='work_time' then
      select * into prior from records where owner_id=auth.uid() and kind='work_time' and data->>'date'=incoming->>'date';
      if found then
        if exists(select 1 from jsonb_each(incoming) f where prior.data ? f.key and prior.data->f.key is distinct from f.value) then
          raise exception 'Archive contains different work time for %. Existing hours were not changed.',incoming->>'date';
        end if;
        if prior.data || incoming <> prior.data then
          perform journal_private.save_record(prior.id,'work_time',prior.data||incoming,prior.revision,null);
        end if;
        continue;
      end if;
    end if;
    if r->>'kind'='study' and exists(select 1 from records where owner_id=auth.uid() and kind='study' and deleted_at is null and data->>'paperId'=incoming->>'paperId' and data->>'date'=incoming->>'date') then continue; end if;
    if r->>'kind'='notebook' and not(incoming ? 'research') then incoming:=incoming||jsonb_build_object('research',incoming->>'icon'='science'); end if;
    if r->>'kind'='entry' and r->>'deleted_at' is null and not(incoming ? 'mergedInto') and not(incoming ? 'reading') then
      select * into prior from records where owner_id=auth.uid() and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and
       (case when incoming->>'paperId' is not null then data->>'paperId'=incoming->>'paperId' else data->>'paperId' is null and not(data ? 'reading') and data->>'notebookId'=incoming->>'notebookId' and data->>'date'=incoming->>'date' end) limit 1;
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

revoke all on function journal_private.save_record(uuid,text,jsonb,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.restore_records(jsonb) from public,anon,authenticated;
grant execute on function public.restore_records(jsonb) to authenticated;
