-- Account transfers (口座間振替) with optional fee
-- from: -(amount + fee) / to: +amount / net total assets: -fee

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  to_asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  date date not null,
  amount integer not null check (amount > 0),
  fee_amount integer not null default 0 check (fee_amount >= 0),
  memo text,
  created_at timestamptz not null default now(),
  constraint account_transfers_distinct_accounts check (
    from_asset_account_id <> to_asset_account_id
  )
);

create index if not exists account_transfers_user_date_idx
  on public.account_transfers (user_id, date desc);

create index if not exists account_transfers_from_idx
  on public.account_transfers (from_asset_account_id);

create index if not exists account_transfers_to_idx
  on public.account_transfers (to_asset_account_id);

alter table public.account_transfers enable row level security;

create policy "account_transfers_select_own"
  on public.account_transfers for select using (auth.uid() = user_id);
create policy "account_transfers_insert_own"
  on public.account_transfers for insert with check (auth.uid() = user_id);
create policy "account_transfers_update_own"
  on public.account_transfers for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "account_transfers_delete_own"
  on public.account_transfers for delete using (auth.uid() = user_id);
