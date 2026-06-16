
create policy "feedback uploads insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'feedback-screenshots');
create policy "feedback uploads read own" on storage.objects for select to authenticated
  using (bucket_id = 'feedback-screenshots' and (auth.uid()::text = (storage.foldername(name))[1]));
