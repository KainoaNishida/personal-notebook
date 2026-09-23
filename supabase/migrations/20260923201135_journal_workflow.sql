-- Preserve all source notes and versions while consolidating daily/paper notes.
-- mergedInto records are permanent originals, excluded from ordinary editing.
do $$
declare o uuid; life uuid; d records; target records; group_row record; original records; merged text;
begin
 for o in select user_id from app_owner loop
  perform pg_advisory_xact_lock(hashtextextended(o::text,0));
  select id into life from records where owner_id=o and kind='notebook' and deleted_at is null and lower(data->>'name')='life' order by updated_at,id limit 1;
  if life is null then
   life:=gen_random_uuid();
   insert into records(id,owner_id,kind,data) values(life,o,'notebook','{"name":"Life","description":"","color":"#f59a56","icon":"reading","order":5,"archived":false}');
  end if;
  for d in select * from records where owner_id=o and kind='day' and deleted_at is null and not(data ? 'migratedTo') loop
   if length(trim(d.data->>'markdown'))>0 then
    target.id:=gen_random_uuid();
    insert into records(id,owner_id,kind,data) values(target.id,o,'entry',jsonb_build_object('notebookId',life,'date',d.data->>'date','title','Reflection','markdown',d.data->>'markdown'));
    insert into record_versions(record_id,revision,owner_id,data) values(d.id,d.revision,o,d.data);
    update records set data=data||jsonb_build_object('migratedTo',target.id),revision=revision+1 where id=d.id;
   end if;
  end loop;
  for group_row in select coalesce(data->>'paperId',(data->>'notebookId')||':'||(data->>'date')) as identity_key
    from records where owner_id=o and kind='entry' and deleted_at is null and not(data ? 'mergedInto')
    group by 1 having count(*)>1 loop
   select * into target from records where owner_id=o and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and coalesce(data->>'paperId',(data->>'notebookId')||':'||(data->>'date'))=group_row.identity_key order by data->>'date',updated_at,id limit 1;
   merged:='';
   for original in select * from records where owner_id=o and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and coalesce(data->>'paperId',(data->>'notebookId')||':'||(data->>'date'))=group_row.identity_key order by data->>'date',updated_at,id loop
    insert into record_versions(record_id,revision,owner_id,data) values(original.id,original.revision,o,original.data);
    if length(trim(original.data->>'markdown'))>0 then merged:=merged||case when merged='' then '' else E'\n\n---\n\n' end||'## '||(original.data->>'date')||case when coalesce(original.data->>'title','')='' then '' else ' · '||(original.data->>'title') end||E'\n\n'||(original.data->>'markdown');end if;
    if original.id<>target.id then update records set data=data||jsonb_build_object('mergedInto',target.id),revision=revision+1 where id=original.id;end if;
   end loop;
   update records set data=jsonb_set(data,'{markdown}',to_jsonb(merged)),revision=revision+1,updated_at=now() where id=target.id;
  end loop;
  insert into record_versions(record_id,revision,owner_id,data) select id,revision,owner_id,data from records where owner_id=o and kind='settings' and deleted_at is null;
  update records set data=data||jsonb_build_object('lifeNotebookId',life),revision=revision+1,updated_at=now() where owner_id=o and kind='settings' and deleted_at is null;
 end loop;
end $$;

create unique index one_daily_entry on records(owner_id,(data->>'notebookId'),(data->>'date')) where kind='entry' and deleted_at is null and data->>'paperId' is null and not(data ? 'mergedInto');
create unique index one_paper_entry on records(owner_id,(data->>'paperId')) where kind='entry' and deleted_at is null and data->>'paperId' is not null and not(data ? 'mergedInto');
create or replace function public.save_record(p_id uuid,p_kind text,p_data jsonb,p_revision integer default 0,p_deleted_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
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
    if old.kind='entry' and (old.data->>'date' is distinct from p_data->>'date' or old.data->>'notebookId' is distinct from p_data->>'notebookId' or old.data->>'paperId' is distinct from p_data->>'paperId') then raise exception 'Entry identity and date cannot change'; end if;
    if old.kind='paper' and old.data-'title' <> p_data-'title' then raise exception 'PDF identity is immutable'; end if;
    if old.kind='paper' and coalesce(length(trim(p_data->>'title')),0)=0 then raise exception 'Paper title required'; end if;
    if old.kind in ('asset','annotation') and old.data<>p_data then raise exception 'Source records are immutable; create a new source'; end if;
    insert into record_versions(record_id,revision,owner_id,data) values(old.id,old.revision,old.owner_id,old.data);
    update records set data=p_data,revision=revision+1,updated_at=now(),deleted_at=p_deleted_at where id=p_id returning * into saved;
  else
    if p_revision<>0 then raise exception 'Record no longer exists'; end if;
    if p_kind='entry' and p_deleted_at is null then
      select * into old from records where owner_id=auth.uid() and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and
       (case when p_data->>'paperId' is not null then data->>'paperId'=p_data->>'paperId' else data->>'paperId' is null and data->>'notebookId'=p_data->>'notebookId' and data->>'date'=p_data->>'date' end) limit 1;
      if found then return jsonb_build_object('conflict',true,'record',to_jsonb(old)-'owner_id'); end if;
    end if;
    insert into records(id,owner_id,kind,data,deleted_at) values(p_id,auth.uid(),p_kind,p_data,p_deleted_at) returning * into saved;
  end if;
  return jsonb_build_object('conflict',false,'record',to_jsonb(saved)-'owner_id');
end $$;
revoke all on function public.save_record(uuid,text,jsonb,integer,timestamptz) from public;
grant execute on function public.save_record(uuid,text,jsonb,integer,timestamptz) to authenticated;

create or replace function public.restore_records(p_records jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; prior records; incoming jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if jsonb_array_length(p_records)>20000 then raise exception 'Archive too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  for r in select value from jsonb_array_elements(p_records) order by case value->>'kind' when 'notebook' then 0 when 'paper' then 1 when 'annotation' then 2 when 'entry' then 3 else 4 end loop
    if r->>'kind' in ('asset','settings') then raise exception 'Assets and settings require separate handling'; end if;
    incoming:=r->'data';
    if r->>'kind'='entry' and r->>'deleted_at' is null and not(incoming ? 'mergedInto') then
      select * into prior from records where owner_id=auth.uid() and kind='entry' and deleted_at is null and not(data ? 'mergedInto') and
       (case when incoming->>'paperId' is not null then data->>'paperId'=incoming->>'paperId' else data->>'paperId' is null and data->>'notebookId'=incoming->>'notebookId' and data->>'date'=incoming->>'date' end) limit 1;
      if found then
       insert into record_versions(record_id,revision,owner_id,data) values(prior.id,prior.revision,prior.owner_id,prior.data);
       if prior.data->>'markdown' is distinct from incoming->>'markdown' and length(trim(incoming->>'markdown'))>0 then
        update records set data=jsonb_set(data,'{markdown}',to_jsonb((data->>'markdown')||E'\n\n---\n\n## Restored notes\n\n'||(incoming->>'markdown'))),revision=revision+1,updated_at=now() where id=prior.id;
       else update records set revision=revision+1 where id=prior.id;end if;
       incoming:=incoming||jsonb_build_object('mergedInto',prior.id);
      end if;
    end if;
    insert into records(id,owner_id,kind,data,deleted_at) values((r->>'id')::uuid,auth.uid(),r->>'kind',incoming,(r->>'deleted_at')::timestamptz);
  end loop;
end $$;
revoke all on function public.restore_records(jsonb) from public;
grant execute on function public.restore_records(jsonb) to authenticated;

revoke execute on function public.restore_records(jsonb) from anon;

-- Explicitly override Supabase's inherited default function grants.
revoke execute on function public.save_record(uuid,text,jsonb,integer,timestamptz) from anon;
