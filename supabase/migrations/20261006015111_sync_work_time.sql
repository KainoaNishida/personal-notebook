-- Account-owned daily work totals. The opening balance remains a single constant;
-- imports and retries replace/compare daily values, never add totals together.
alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check(kind in ('notebook','entry','day','activity','paper','annotation','asset','settings','conversation','artifact','label','writing_progress','study','work_time'));
create unique index one_work_time_day on public.records(owner_id,(data->>'date')) where kind='work_time';

create function journal_private.validate_work_time() returns trigger language plpgsql set search_path=public as $$
declare total numeric;
begin
 if new.kind<>'work_time' then return new; end if;
 if coalesce(new.data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid work date'; end if;
 perform (new.data->>'date')::date;
 if new.deleted_at is not null or (tg_op='UPDATE' and old.data->>'date' is distinct from new.data->>'date') then raise exception 'Work day identity cannot change'; end if;
 if new.data ? 'actualSeconds' and (jsonb_typeof(new.data->'actualSeconds') is distinct from 'number' or (new.data->>'actualSeconds') !~ '^\d+$' or (new.data->>'actualSeconds')::numeric>112589990684262) then raise exception 'Invalid actual work seconds'; end if;
 if new.data ? 'taskInput' and (jsonb_typeof(new.data->'taskInput') is distinct from 'string' or length(new.data->>'taskInput')>10000) then raise exception 'Invalid task time list'; end if;
 if exists(select 1 from jsonb_object_keys(new.data) k where k not in ('date','actualSeconds','taskInput')) then raise exception 'Unknown work time field'; end if;
 -- Same owner lock used by save_record/restore_records makes this aggregate safe.
 select 65901 + coalesce(sum((data->>'actualSeconds')::numeric),0) into total from records where owner_id=new.owner_id and kind='work_time' and id<>new.id and data->>'date'>='2026-10-02';
 if new.data->>'date'>='2026-10-02' then total:=total+coalesce((new.data->>'actualSeconds')::numeric,0); end if;
 if total>112589990684262 then raise exception 'The work time total is too large'; end if;
 return new;
end $$;
revoke all on function journal_private.validate_work_time() from public,anon,authenticated;
create trigger validate_work_time before insert or update on public.records for each row execute function journal_private.validate_work_time();

-- Compare only the edited field: changing tasks cannot overwrite actual hours.
-- A NULL expected value imports into a missing field, never over an existing day.
create function public.save_work_time(p_date date,p_field text,p_value jsonb,p_expected jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare prior records; current_value jsonb; result jsonb;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_date is null or p_field is null or p_field not in ('actualSeconds','taskInput') or p_value is null or p_value='null'::jsonb then raise exception 'Invalid work time update'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into prior from records where owner_id=auth.uid() and kind='work_time' and data->>'date'=p_date::text for update;
 current_value:=coalesce(prior.data->p_field,'null'::jsonb);
 if current_value=p_value then return jsonb_build_object('conflict',false,'record',to_jsonb(prior)-'owner_id'); end if;
 if current_value is distinct from coalesce(p_expected,'null'::jsonb) then return jsonb_build_object('conflict',true,'record',to_jsonb(prior)-'owner_id'); end if;
 result:=journal_private.save_record(coalesce(prior.id,gen_random_uuid()),'work_time',coalesce(prior.data,jsonb_build_object('date',p_date))||jsonb_build_object(p_field,p_value),coalesce(prior.revision,0),null);
 return result;
end $$;
revoke all on function public.save_work_time(date,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_work_time(date,text,jsonb,jsonb) to authenticated;

-- Restore missing days/fields; repeated archives never duplicate hours.
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
