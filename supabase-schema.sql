create table if not exists public.calendar_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.calendar_snapshots enable row level security;

drop policy if exists "Users can read their own calendar snapshot" on public.calendar_snapshots;
create policy "Users can read their own calendar snapshot"
on public.calendar_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own calendar snapshot" on public.calendar_snapshots;
create policy "Users can insert their own calendar snapshot"
on public.calendar_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own calendar snapshot" on public.calendar_snapshots;
create policy "Users can update their own calendar snapshot"
on public.calendar_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
