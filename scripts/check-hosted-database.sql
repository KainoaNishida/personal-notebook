-- Run through an authorized database administration connection.
-- Uses the configured owner and rolls back every synthetic write.
begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.app_owner), true);
set local role authenticated;
do $$
declare notebook uuid:=gen_random_uuid(); entry uuid:=gen_random_uuid(); r jsonb; body jsonb; n bigint;
begin
  if not public.is_owner() then raise exception 'Owner is not configured'; end if;
  perform public.save_record(notebook,'notebook','{"name":"Deployment verification"}'::jsonb);
  body:=jsonb_build_object('notebookId',notebook,'date','2026-09-22','markdown','Synthetic deployment check','title','Verification');
  r:=public.save_record(entry,'entry',body);
  if (r->'record'->>'revision')::integer<>1 then raise exception 'Initial revision failed'; end if;
  r:=public.save_record(entry,'entry',body || '{"markdown":"Revised synthetic check"}'::jsonb,1);
  if (r->'record'->>'revision')::integer<>2 then raise exception 'Saved revision failed'; end if;
  r:=public.save_record(entry,'entry',body,1);
  if r->>'conflict'<>'true' then raise exception 'Stale write was not rejected'; end if;
  select count(*) into n from public.record_versions where record_id=entry;
  if n<>1 then raise exception 'Previous revision was not preserved'; end if;
  if (public.get_usage()->>'limit')::bigint<>20000000 then raise exception 'Monthly budget mismatch'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if public.is_owner() then raise exception 'Non-owner accepted'; end if;
  select count(*) into n from public.records;
  if n<>0 then raise exception 'Non-owner can read records'; end if;
  begin
    perform public.save_record(gen_random_uuid(),'day','{"date":"2026-09-22","markdown":"Unauthorized"}'::jsonb);
    raise exception 'Non-owner write was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS hosted owner writes, revision history, stale-write conflict, non-owner denial and monthly limit; synthetic writes rolled back' as result;
