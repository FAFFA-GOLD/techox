-- Company / ad-hoc holidays (weekdays treated as holidays for lunch daily-limit)

create table public.daily_spend_holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index daily_spend_holidays_user_date_idx
  on public.daily_spend_holidays (user_id, date);

alter table public.daily_spend_holidays enable row level security;

create policy "dsh_select_own" on public.daily_spend_holidays
  for select using (auth.uid() = user_id);
create policy "dsh_insert_own" on public.daily_spend_holidays
  for insert with check (auth.uid() = user_id);
create policy "dsh_update_own" on public.daily_spend_holidays
  for update using (auth.uid() = user_id);
create policy "dsh_delete_own" on public.daily_spend_holidays
  for delete using (auth.uid() = user_id);
