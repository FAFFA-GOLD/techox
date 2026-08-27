-- Makiko rest days (calendar marker only; does not affect lunch weekday count)

create table if not exists public.daily_spend_makiko_offs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_spend_makiko_offs_user_date_idx
  on public.daily_spend_makiko_offs (user_id, date);

alter table public.daily_spend_makiko_offs enable row level security;

create policy "dsmo_select_own" on public.daily_spend_makiko_offs
  for select using (auth.uid() = user_id);
create policy "dsmo_insert_own" on public.daily_spend_makiko_offs
  for insert with check (auth.uid() = user_id);
create policy "dsmo_update_own" on public.daily_spend_makiko_offs
  for update using (auth.uid() = user_id);
create policy "dsmo_delete_own" on public.daily_spend_makiko_offs
  for delete using (auth.uid() = user_id);
