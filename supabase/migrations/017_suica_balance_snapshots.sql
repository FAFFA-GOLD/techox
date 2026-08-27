-- Suica card balance (independent from daily-spend totals / transport budget)
-- Displayed next to 交通費; decreases when 交通費 category entries are recorded.
-- Manual balance upsert is authoritative as of as_of_date.

create table if not exists public.suica_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  as_of_date date not null,
  balance integer not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, as_of_date)
);

create index if not exists suica_balance_snapshots_user_date_idx
  on public.suica_balance_snapshots (user_id, as_of_date desc);

alter table public.suica_balance_snapshots enable row level security;

create policy "suica_balance_snapshots_select_own"
  on public.suica_balance_snapshots for select using (auth.uid() = user_id);
create policy "suica_balance_snapshots_insert_own"
  on public.suica_balance_snapshots for insert with check (auth.uid() = user_id);
create policy "suica_balance_snapshots_update_own"
  on public.suica_balance_snapshots for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "suica_balance_snapshots_delete_own"
  on public.suica_balance_snapshots for delete using (auth.uid() = user_id);
