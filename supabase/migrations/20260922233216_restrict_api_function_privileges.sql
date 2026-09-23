-- Hosted Supabase grants function privileges directly to API roles by default.
-- Revoking PUBLIC alone does not remove these inherited defaults.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.save_record(uuid,text,jsonb,integer,timestamptz) to authenticated;
grant execute on function public.initialize_notebooks(jsonb) to authenticated;
grant execute on function public.restore_records(jsonb) to authenticated;
grant execute on function public.remove_orphan_asset(uuid) to authenticated;
grant execute on function public.get_usage() to authenticated;
grant execute on function public.reserve_generation(uuid,uuid,text,text,bigint,uuid) to service_role;
grant execute on function public.finish_generation(uuid,bigint,jsonb,text) to service_role;
grant execute on function public.purge_expired_trash() to service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
create index ai_requests_owner_month on public.ai_requests(owner_id,month);
create index ai_requests_annotation on public.ai_requests(annotation_id);
alter policy owner_reads on public.records using ((select public.is_owner()) and owner_id=(select auth.uid()));
alter policy owner_reads_versions on public.record_versions using ((select public.is_owner()) and owner_id=(select auth.uid()));
alter policy owner_reads_requests on public.ai_requests using ((select public.is_owner()) and owner_id=(select auth.uid()));
alter policy journal_select on storage.objects using(bucket_id='journal' and (select public.is_owner()) and (storage.foldername(name))[1]=(select auth.uid())::text);
alter policy journal_insert on storage.objects with check(bucket_id='journal' and (select public.is_owner()) and (storage.foldername(name))[1]=(select auth.uid())::text);
alter policy journal_delete on storage.objects using(bucket_id='journal' and (select public.is_owner()) and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.records where kind='asset' and data->>'path'=name));
