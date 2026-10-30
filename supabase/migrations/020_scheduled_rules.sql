-- 毎日の支出に支払い元口座・収入・取引（定期/カード/ローン）の発生行を載せる。
-- 発生行は保存時に作る。将来の残高行は持たない。

alter table public.daily_spend_entries
  add column if not exists asset_account_id uuid
    references public.asset_accounts (id) on delete set null;

alter table public.daily_spend_entries
  add column if not exists kind text not null default 'expense';

alter table public.daily_spend_entries
  drop constraint if exists daily_spend_entries_kind_check;

alter table public.daily_spend_entries
  add constraint daily_spend_entries_kind_check
  check (kind in ('expense', 'income'));

alter table public.daily_spend_entries
  alter column category_id drop not null;

alter table public.daily_spend_entries
  add column if not exists scheduled_rule_id uuid;

alter table public.daily_spend_entries
  add column if not exists amount_locked boolean not null default false;

create index if not exists daily_spend_entries_account_date_idx
  on public.daily_spend_entries (user_id, asset_account_id, date);

create table if not exists public.scheduled_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  schedule_kind text not null check (schedule_kind in ('recurring', 'card', 'loan')),
  flow text not null check (flow in ('expense', 'income')),
  amount integer not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  interval_months integer not null default 1 check (interval_months between 1 and 24),
  start_date date not null,
  end_date date,
  asset_account_id uuid references public.asset_accounts (id) on delete set null,
  category_id uuid references public.daily_spend_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_rules_user_id_idx
  on public.scheduled_rules (user_id, start_date);

alter table public.daily_spend_entries
  drop constraint if exists daily_spend_entries_scheduled_rule_id_fkey;

alter table public.daily_spend_entries
  add constraint daily_spend_entries_scheduled_rule_id_fkey
  foreign key (scheduled_rule_id) references public.scheduled_rules (id) on delete set null;

create unique index if not exists daily_spend_entries_rule_date_uidx
  on public.daily_spend_entries (scheduled_rule_id, date)
  where scheduled_rule_id is not null;

create table if not exists public.scheduled_rule_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scheduled_rule_id uuid not null references public.scheduled_rules (id) on delete cascade,
  date date not null,
  unique (scheduled_rule_id, date)
);

alter table public.scheduled_rules enable row level security;
alter table public.scheduled_rule_skips enable row level security;

drop policy if exists "scheduled_rules_select_own" on public.scheduled_rules;
drop policy if exists "scheduled_rules_insert_own" on public.scheduled_rules;
drop policy if exists "scheduled_rules_update_own" on public.scheduled_rules;
drop policy if exists "scheduled_rules_delete_own" on public.scheduled_rules;

create policy "scheduled_rules_select_own"
  on public.scheduled_rules for select using (auth.uid() = user_id);
create policy "scheduled_rules_insert_own"
  on public.scheduled_rules for insert with check (auth.uid() = user_id);
create policy "scheduled_rules_update_own"
  on public.scheduled_rules for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scheduled_rules_delete_own"
  on public.scheduled_rules for delete using (auth.uid() = user_id);

drop policy if exists "scheduled_rule_skips_select_own" on public.scheduled_rule_skips;
drop policy if exists "scheduled_rule_skips_insert_own" on public.scheduled_rule_skips;
drop policy if exists "scheduled_rule_skips_delete_own" on public.scheduled_rule_skips;

create policy "scheduled_rule_skips_select_own"
  on public.scheduled_rule_skips for select using (auth.uid() = user_id);
create policy "scheduled_rule_skips_insert_own"
  on public.scheduled_rule_skips for insert with check (auth.uid() = user_id);
create policy "scheduled_rule_skips_delete_own"
  on public.scheduled_rule_skips for delete using (auth.uid() = user_id);

drop trigger if exists scheduled_rules_set_updated_at on public.scheduled_rules;
create trigger scheduled_rules_set_updated_at
before update on public.scheduled_rules
for each row execute function public.set_updated_at();

alter table public.user_settings
  add column if not exists schedules_migrated boolean not null default false;
