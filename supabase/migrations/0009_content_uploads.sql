-- Private bucket for PDFs and text files Miguel uploads as found content.
-- Each object lives under a folder named for the owner's user id; the policies
-- below let a user read and write only their own folder. Run in the Supabase
-- SQL editor, like 0008.
insert into storage.buckets (id, name, public, file_size_limit)
values ('content-uploads', 'content-uploads', false, 4194304)
on conflict (id) do nothing;

create policy "content uploads: read own folder"
  on storage.objects for select
  using (bucket_id = 'content-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "content uploads: insert own folder"
  on storage.objects for insert
  with check (bucket_id = 'content-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "content uploads: update own folder"
  on storage.objects for update
  using (bucket_id = 'content-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
