-- 収入を部門へ割り振る基本設定と、給与期ごとの上書き。
-- 生活費・交通費を出す部門。

alter table public.cashflow_plan
  add column if not exists daily_account_id uuid references public.asset_accounts (id) on delete set null,
  add column if not exists transport_account_id uuid references public.asset_accounts (id) on delete set null;

create table if not exists public.cashflow_income_allocations (
  user_id uuid not null references auth.users (id) on delete cascade,
  scheduled_rule_id uuid not null references public.scheduled_rules (id) on delete cascade,
  asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  amount integer not null check (amount >= 0),
  primary key (user_id, scheduled_rule_id, asset_account_id)
);

create table if not exists public.cashflow_income_allocation_periods (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  scheduled_rule_id uuid not null references public.scheduled_rules (id) on delete cascade,
  asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  amount integer not null check (amount >= 0),
  primary key (user_id, period_start, scheduled_rule_id, asset_account_id)
);

alter table public.cashflow_income_allocations enable row level security;
alter table public.cashflow_income_allocation_periods enable row level security;

drop policy if exists "cashflow_income_allocations_select_own" on public.cashflow_income_allocations;
drop policy if exists "cashflow_income_allocations_insert_own" on public.cashflow_income_allocations;
drop policy if exists "cashflow_income_allocations_update_own" on public.cashflow_income_allocations;
drop policy if exists "cashflow_income_allocations_delete_own" on public.cashflow_income_allocations;
create policy "cashflow_income_allocations_select_own"
  on public.cashflow_income_allocations for select using (auth.uid() = user_id);
create policy "cashflow_income_allocations_insert_own"
  on public.cashflow_income_allocations for insert with check (auth.uid() = user_id);
create policy "cashflow_income_allocations_update_own"
  on public.cashflow_income_allocations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cashflow_income_allocations_delete_own"
  on public.cashflow_income_allocations for delete using (auth.uid() = user_id);

drop policy if exists "cashflow_income_allocation_periods_select_own" on public.cashflow_income_allocation_periods;
drop policy if exists "cashflow_income_allocation_periods_insert_own" on public.cashflow_income_allocation_periods;
drop policy if exists "cashflow_income_allocation_periods_update_own" on public.cashflow_income_allocation_periods;
drop policy if exists "cashflow_income_allocation_periods_delete_own" on public.cashflow_income_allocation_periods;
create policy "cashflow_income_allocation_periods_select_own"
  on public.cashflow_income_allocation_periods for select using (auth.uid() = user_id);
create policy "cashflow_income_allocation_periods_insert_own"
  on public.cashflow_income_allocation_periods for insert with check (auth.uid() = user_id);
create policy "cashflow_income_allocation_periods_update_own"
  on public.cashflow_income_allocation_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cashflow_income_allocation_periods_delete_own"
  on public.cashflow_income_allocation_periods for delete using (auth.uid() = user_id);
