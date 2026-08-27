-- Monthly scratchpad (memo + calc notes) under the daily spend calendar
-- month_key: 'shared' = 全月共通メモ（アプリはこちらを使用）
-- または yyyy-MM（旧データ互換。011 で shared へ統合）

create table if not exists public.daily_scratchpads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$' or month_key = 'shared'),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_scratchpads_user_month_uidx
  on public.daily_scratchpads (user_id, month_key);

create index if not exists daily_scratchpads_user_id_idx
  on public.daily_scratchpads (user_id);

alter table public.daily_scratchpads enable row level security;

create policy "daily_scratchpads_select_own"
  on public.daily_scratchpads for select
  using (auth.uid() = user_id);

create policy "daily_scratchpads_insert_own"
  on public.daily_scratchpads for insert
  with check (auth.uid() = user_id);

create policy "daily_scratchpads_update_own"
  on public.daily_scratchpads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "daily_scratchpads_delete_own"
  on public.daily_scratchpads for delete
  using (auth.uid() = user_id);
