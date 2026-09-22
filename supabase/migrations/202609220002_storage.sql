insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('journal','journal',false,26214400,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy journal_select on storage.objects for select to authenticated using(bucket_id='journal' and public.is_owner() and (storage.foldername(name))[1]=auth.uid()::text);
create policy journal_insert on storage.objects for insert to authenticated with check(bucket_id='journal' and public.is_owner() and (storage.foldername(name))[1]=auth.uid()::text);
create policy journal_delete on storage.objects for delete to authenticated using(bucket_id='journal' and public.is_owner() and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.records where kind='asset' and data->>'path'=name));
-- No update policy: originals are immutable. To replace, upload a new asset.
