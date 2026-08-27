-- Multi asset accounts (bank / emoney / other) + per-account balances
-- Migrates legacy balance_snapshots onto a per-user main bank account.

create table if not exists public.asset_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank', 'emoney', 'other')),
  is_main boolean not null default false,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_accounts_user_id_idx
  on public.asset_accounts (user_id, sort_order, created_at);

create unique index if not exists asset_accounts_one_main_per_user
  on public.asset_accounts (user_id)
  where is_main;

alter table public.asset_accounts enable row level security;

create policy "asset_accounts_select_own"
  on public.asset_accounts for select using (auth.uid() = user_id);
create policy "asset_accounts_insert_own"
  on public.asset_accounts for insert with check (auth.uid() = user_id);
create policy "asset_accounts_update_own"
  on public.asset_accounts for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "asset_accounts_delete_own"
  on public.asset_accounts for delete using (auth.uid() = user_id);

create table if not exists public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  as_of_date date not null,
  balance integer not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, asset_account_id, as_of_date)
);

create index if not exists account_balance_snapshots_user_account_date_idx
  on public.account_balance_snapshots (user_id, asset_account_id, as_of_date desc);

alter table public.account_balance_snapshots enable row level security;

create policy "account_balance_snapshots_select_own"
  on public.account_balance_snapshots for select using (auth.uid() = user_id);
create policy "account_balance_snapshots_insert_own"
  on public.account_balance_snapshots for insert with check (auth.uid() = user_id);
create policy "account_balance_snapshots_update_own"
  on public.account_balance_snapshots for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "account_balance_snapshots_delete_own"
  on public.account_balance_snapshots for delete using (auth.uid() = user_id);

-- Link ledger entities to an asset account (null = treat as main bank in app)
alter table public.transactions
  add column if not exists asset_account_id uuid
  references public.asset_accounts (id) on delete set null;

alter table public.recurring_rules
  add column if not exists asset_account_id uuid
  references public.asset_accounts (id) on delete set null;

alter table public.credit_cards
  add column if not exists asset_account_id uuid
  references public.asset_accounts (id) on delete set null;

alter table public.loans
  add column if not exists asset_account_id uuid
  references public.asset_accounts (id) on delete set null;

create index if not exists transactions_asset_account_id_idx
  on public.transactions (asset_account_id);
create index if not exists recurring_rules_asset_account_id_idx
  on public.recurring_rules (asset_account_id);
create index if not exists credit_cards_asset_account_id_idx
  on public.credit_cards (asset_account_id);
create index if not exists loans_asset_account_id_idx
  on public.loans (asset_account_id);

-- Ensure every existing user has a main bank, then copy legacy snapshots
insert into public.asset_accounts (user_id, name, kind, is_main, sort_order)
select u.id, 'あいち銀行', 'bank', true, 0
from auth.users u
where not exists (
  select 1 from public.asset_accounts a
  where a.user_id = u.id and a.is_main = true
);

insert into public.account_balance_snapshots (
  user_id, asset_account_id, as_of_date, balance, note, created_at
)
select
  s.user_id,
  a.id,
  s.as_of_date,
  s.balance,
  s.note,
  s.created_at
from public.balance_snapshots s
join public.asset_accounts a
  on a.user_id = s.user_id and a.is_main = true
where not exists (
  select 1 from public.account_balance_snapshots x
  where x.user_id = s.user_id
    and x.asset_account_id = a.id
    and x.as_of_date = s.as_of_date
);
