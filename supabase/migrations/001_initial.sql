-- Money app schema (run in Supabase SQL Editor on a dedicated project)

create extension if not exists "pgcrypto";

-- Categories -----------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  color text not null default '#0f766e',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index categories_user_id_idx on public.categories (user_id);

-- Recurring rules ------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  amount integer not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income')),
  interval text not null default 'monthly' check (interval in ('monthly')),
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

create index recurring_rules_user_id_idx on public.recurring_rules (user_id);

-- Transactions ---------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  date date not null,
  amount integer not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date);
create index transactions_category_id_idx on public.transactions (category_id);

-- Balance snapshots (基準残高) -----------------------------------------------
create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  as_of_date date not null,
  balance integer not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, as_of_date)
);

create index balance_snapshots_user_date_idx on public.balance_snapshots (user_id, as_of_date);

-- updated_at trigger ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.balance_snapshots enable row level security;

create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

create policy "recurring_select_own" on public.recurring_rules
  for select using (auth.uid() = user_id);
create policy "recurring_insert_own" on public.recurring_rules
  for insert with check (auth.uid() = user_id);
create policy "recurring_update_own" on public.recurring_rules
  for update using (auth.uid() = user_id);
create policy "recurring_delete_own" on public.recurring_rules
  for delete using (auth.uid() = user_id);

create policy "snapshots_select_own" on public.balance_snapshots
  for select using (auth.uid() = user_id);
create policy "snapshots_insert_own" on public.balance_snapshots
  for insert with check (auth.uid() = user_id);
create policy "snapshots_update_own" on public.balance_snapshots
  for update using (auth.uid() = user_id);
create policy "snapshots_delete_own" on public.balance_snapshots
  for delete using (auth.uid() = user_id);
