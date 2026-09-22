-- A single-owner workspace. Configure app_owner from the SQL editor after
-- creating the owner in Auth. No client can claim or change ownership.
create table public.app_owner (singleton boolean primary key default true check (singleton), user_id uuid not null unique references auth.users(id));
alter table public.app_owner enable row level security;
revoke all on public.app_owner from anon, authenticated;

create function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_owner where user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- Typed entities use one revisioned envelope. Data schemas are validated at the
-- service boundary; core shape/reference constraints are also checked below.
create table public.records (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('notebook','entry','day','activity','paper','annotation','asset','settings','conversation','artifact')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1500000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index records_owner on public.records(owner_id, kind);
create unique index one_day on public.records(owner_id,(data->>'date')) where kind='day' and deleted_at is null;
create unique index one_activity on public.records(owner_id,(data->>'date'),(data->>'notebookId')) where kind='activity' and deleted_at is null;
create unique index one_setting on public.records(owner_id) where kind='settings' and deleted_at is null;
create unique index one_paper on public.records(owner_id,(data->>'fingerprint')) where kind='paper' and deleted_at is null;
alter table public.records enable row level security;
create policy owner_reads on public.records for select to authenticated using (public.is_owner() and owner_id=auth.uid());
revoke all on public.records from anon,authenticated;
grant select on public.records to authenticated;

create table public.record_versions (
  record_id uuid not null references public.records(id) on delete cascade,
  revision integer not null, owner_id uuid not null, data jsonb not null, saved_at timestamptz not null default now(),
  primary key(record_id,revision)
);
alter table public.record_versions enable row level security;
create policy owner_reads_versions on public.record_versions for select to authenticated using (public.is_owner() and owner_id=auth.uid());
revoke all on public.record_versions from anon,authenticated;
grant select on public.record_versions to authenticated;

create function public.validate_record() returns trigger language plpgsql set search_path=public as $$
declare k text; target text; v text;
begin
  if new.kind in ('entry','day','activity') then
    if not (new.data ? 'date') or (new.data->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid journal date'; end if;
    perform (new.data->>'date')::date;
  end if;
  if new.kind in ('entry','day') and jsonb_typeof(new.data->'markdown') is distinct from 'string' then raise exception 'Markdown is required'; end if;
  if new.kind='notebook' and (coalesce(length(trim(new.data->>'name')),0)=0 or length(new.data->>'name')>80) then raise exception 'Notebook name is required (80 characters maximum)'; end if;
  if new.kind='asset' and ((new.data->>'path') not like new.owner_id::text||'/%' or (new.data->>'mime') not in ('application/pdf','image/png','image/jpeg','image/webp') or (new.data->>'size')::bigint<0 or (new.data->>'size')::bigint > case when new.data->>'mime'='application/pdf' then 26214400 else 10485760 end) then raise exception 'Invalid private asset'; end if;
  if new.kind='asset' and (coalesce(new.data->>'path','')='' or coalesce(new.data->>'mime','')='' or jsonb_typeof(new.data->'size') is distinct from 'number') then raise exception 'Incomplete private asset'; end if;
  if new.kind='settings' and not exists(select 1 from pg_timezone_names where name=new.data->>'timezone') then raise exception 'Invalid timezone'; end if;
  for k,target in select * from (values ('notebookId','notebook'),('paperId','paper'),('assetId','asset'),('imageAssetId','asset'),('annotationId','annotation')) as refs(k,target) loop
    v:=new.data->>k;
    if v is not null and not exists(select 1 from records where id=v::uuid and owner_id=new.owner_id and kind=target) then raise exception 'Missing reference: %',k; end if;
  end loop;
  if new.kind in ('entry','activity') and not(new.data?'notebookId') then raise exception 'Notebook required'; end if;
  if new.kind='paper' and not(new.data?'assetId') then raise exception 'PDF asset required'; end if;
  if new.kind='annotation' and (not(new.data?'paperId') or coalesce((new.data->>'page')::integer,-1)<0) then raise exception 'Paper and page required'; end if;
  if new.kind='annotation' then
    if jsonb_typeof(new.data->'rects') is distinct from 'array' or jsonb_array_length(new.data->'rects')=0 then raise exception 'Selection rectangles required'; end if;
    if (new.data->>'page')::integer >= (select (data->>'pages')::integer from records where id=(new.data->>'paperId')::uuid) then raise exception 'Annotation page is outside the document'; end if;
    if exists(select 1 from jsonb_array_elements(new.data->'rects') r where not(r ?& array['x','y','width','height']) or (r->>'x')::numeric<0 or (r->>'y')::numeric<0 or (r->>'width')::numeric<=0 or (r->>'height')::numeric<=0 or (r->>'x')::numeric+(r->>'width')::numeric>1.000001 or (r->>'y')::numeric+(r->>'height')::numeric>1.000001) then raise exception 'Invalid selection rectangle'; end if;
  end if;
  return new;
end $$;
create trigger validate_record before insert or update on public.records for each row execute function public.validate_record();

create function public.save_record(p_id uuid,p_kind text,p_data jsonb,p_revision integer default 0,p_deleted_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare old records; saved records;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into old from records where id=p_id for update;
  if found then
    if old.owner_id<>auth.uid() then raise exception 'Owner access required' using errcode='42501'; end if;
    if old.revision<>p_revision then return jsonb_build_object('conflict',true,'record',to_jsonb(old)-'owner_id'); end if;
    if old.kind<>p_kind then raise exception 'Entity kind cannot change'; end if;
    if old.deleted_at is not null and old.deleted_at < now()-interval '30 days' then raise exception 'Trash retention has expired'; end if;
    if old.kind in ('asset','paper','annotation') and old.data<>p_data then raise exception 'Source records are immutable; create a new source'; end if;
    insert into record_versions(record_id,revision,owner_id,data) values(old.id,old.revision,old.owner_id,old.data);
    update records set data=p_data,revision=revision+1,updated_at=now(),deleted_at=p_deleted_at where id=p_id returning * into saved;
  else
    if p_revision<>0 then raise exception 'Record no longer exists'; end if;
    insert into records(id,owner_id,kind,data,deleted_at) values(p_id,auth.uid(),p_kind,p_data,p_deleted_at) returning * into saved;
  end if;
  return jsonb_build_object('conflict',false,'record',to_jsonb(saved)-'owner_id');
end $$;
revoke all on function public.save_record(uuid,text,jsonb,integer,timestamptz) from public;
grant execute on function public.save_record(uuid,text,jsonb,integer,timestamptz) to authenticated;

create function public.initialize_notebooks(p_notebooks jsonb) returns void language plpgsql security definer set search_path=public as $$
declare n jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if exists(select 1 from records where owner_id=auth.uid() and kind='notebook') then return; end if;
  for n in select value from jsonb_array_elements(p_notebooks) loop
    insert into records(id,owner_id,kind,data) values(gen_random_uuid(),auth.uid(),'notebook',n);
  end loop;
end $$;
revoke all on function public.initialize_notebooks(jsonb) from public;
grant execute on function public.initialize_notebooks(jsonb) to authenticated;

create function public.restore_records(p_records jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if jsonb_array_length(p_records)>20000 then raise exception 'Archive too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  for r in select value from jsonb_array_elements(p_records) order by case value->>'kind' when 'notebook' then 0 when 'paper' then 1 when 'annotation' then 2 when 'entry' then 3 else 4 end loop
    if r->>'kind' in ('asset','settings') then raise exception 'Assets and settings require separate handling'; end if;
    insert into records(id,owner_id,kind,data,deleted_at) values((r->>'id')::uuid,auth.uid(),r->>'kind',r->'data',(r->>'deleted_at')::timestamptz);
  end loop;
end $$;
revoke all on function public.restore_records(jsonb) from public;
grant execute on function public.restore_records(jsonb) to authenticated;

create function public.remove_orphan_asset(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if exists(select 1 from records where owner_id=auth.uid() and id<>p_id and data::text like '%'||p_id::text||'%') then raise exception 'Asset still referenced'; end if;
  delete from records where id=p_id and owner_id=auth.uid() and kind='asset';
end $$;
revoke all on function public.remove_orphan_asset(uuid) from public;
grant execute on function public.remove_orphan_asset(uuid) to authenticated;

-- Only service_role can reserve/reconcile paid generations. Clients cannot
-- forge cost reports or release reservations.
create table public.ai_months(owner_id uuid not null references auth.users(id), month text not null, primary key(owner_id,month));
create table public.ai_requests(
 id uuid primary key, owner_id uuid not null references auth.users(id), month text not null, annotation_id uuid references public.records(id),
 request_hash text not null, model text not null, state text not null default 'reserved' check(state in ('reserved','complete','failed','unknown')),
 reserved bigint not null check(reserved>=0), actual bigint not null default 0 check(actual>=0), result jsonb, error text,
 created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(owner_id,month) references public.ai_months(owner_id,month)
);
alter table public.ai_months enable row level security;
alter table public.ai_requests enable row level security;
create policy owner_reads_requests on public.ai_requests for select to authenticated using(public.is_owner() and owner_id=auth.uid());
revoke all on public.ai_requests,public.ai_months from anon,authenticated;
grant select on public.ai_requests to authenticated;
grant all on public.app_owner,public.records,public.record_versions,public.ai_months,public.ai_requests to service_role;

create function public.reserve_generation(p_id uuid,p_owner uuid,p_hash text,p_model text,p_max bigint,p_annotation uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare m text:=to_char(now() at time zone 'UTC','YYYY-MM'); used bigint; prior ai_requests;
begin
  if not exists(select 1 from app_owner where user_id=p_owner) then raise exception 'Owner access required'; end if;
  if p_annotation is not null and not exists(select 1 from records where id=p_annotation and kind='annotation' and owner_id=p_owner) then raise exception 'Invalid annotation'; end if;
  if p_max<=0 or p_max>20000000 then raise exception 'Invalid reservation'; end if;
  -- Owner-wide lock also serializes the same request ID across month rollover.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':ai',0));
  select * into prior from ai_requests where id=p_id;
  if found then
    if prior.owner_id<>p_owner or prior.request_hash<>p_hash or prior.model<>p_model then raise exception 'Request ID already used for different input'; end if;
    return jsonb_build_object('dispatch',false,'request',to_jsonb(prior));
  end if;
  insert into ai_months values(p_owner,m) on conflict do nothing;
  select coalesce(sum(actual+reserved),0) into used from ai_requests where owner_id=p_owner and month=m;
  if used+p_max>20000000 then raise exception 'Monthly AI budget reached. Your notes remain available.'; end if;
  insert into ai_requests(id,owner_id,month,request_hash,model,reserved,annotation_id) values(p_id,p_owner,m,p_hash,p_model,p_max,p_annotation);
  return jsonb_build_object('dispatch',true);
end $$;
revoke all on function public.reserve_generation(uuid,uuid,text,text,bigint,uuid) from public;
grant execute on function public.reserve_generation(uuid,uuid,text,text,bigint,uuid) to service_role;

create function public.finish_generation(p_id uuid,p_actual bigint,p_result jsonb,p_error text default null) returns void language plpgsql security definer set search_path=public as $$
declare prior ai_requests;
begin
  select * into prior from ai_requests where id=p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if prior.state='complete' or (prior.state='failed' and prior.reserved=0) then return; end if;
  if p_actual is null then
    update ai_requests set state='unknown',error=p_error where id=p_id;
  else
    if p_actual<0 or p_actual>prior.reserved then raise exception 'Cost exceeds reservation; keep reservation pending reconciliation'; end if;
    update ai_requests set state=case when p_error is null then 'complete' else 'failed' end,actual=p_actual,reserved=0,result=p_result,error=p_error,completed_at=now() where id=p_id;
  end if;
end $$;
revoke all on function public.finish_generation(uuid,bigint,jsonb,text) from public;
grant execute on function public.finish_generation(uuid,bigint,jsonb,text) to service_role;

create function public.get_usage() returns jsonb language plpgsql security definer set search_path=public as $$
declare m text:=to_char(now() at time zone 'UTC','YYYY-MM'); result jsonb;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 select jsonb_build_object('spent',coalesce(sum(actual),0),'reserved',coalesce(sum(reserved),0),'limit',20000000,'month',m) into result from ai_requests where owner_id=auth.uid() and month=m;
 return result;
end $$;
revoke all on function public.get_usage() from public;
grant execute on function public.get_usage() to authenticated;

create function public.purge_expired_trash() returns bigint language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
 delete from records where kind='entry' and deleted_at<now()-interval '30 days';
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.purge_expired_trash() from public;
grant execute on function public.purge_expired_trash() to service_role;
