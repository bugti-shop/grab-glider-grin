
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'general',
  message text not null,
  screenshot_url text,
  user_agent text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);
grant select, insert on public.feedback to authenticated;
grant insert on public.feedback to anon;
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;
create policy "anyone can submit feedback" on public.feedback for insert to anon, authenticated with check (user_id is null or auth.uid() = user_id);
create policy "users view their own feedback" on public.feedback for select to authenticated using (auth.uid() = user_id);
