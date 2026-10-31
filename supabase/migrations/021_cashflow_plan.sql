-- キャッシュフローの基本予算と、給与期ごとの上書き。

create table if not exists public.cashflow_plan (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_budget integer not null default 0 check (daily_budget >= 0),
  transport_budget integer not null default 0 check (transport_budget >= 0),
  adjustment integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.cashflow_plan_periods (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  daily_budget integer not null check (daily_budget >= 0),
  transport_budget integer not null check (transport_budget >= 0),
  adjustment integer not null default 0,
  primary key (user_id, period_start)
);

alter table public.cashflow_plan enable row level security;
alter table public.cashflow_plan_periods enable row level security;

drop policy if exists "cashflow_plan_select_own" on public.cashflow_plan;
drop policy if exists "cashflow_plan_insert_own" on public.cashflow_plan;
drop policy if exists "cashflow_plan_update_own" on public.cashflow_plan;
create policy "cashflow_plan_select_own"
  on public.cashflow_plan for select using (auth.uid() = user_id);
create policy "cashflow_plan_insert_own"
  on public.cashflow_plan for insert with check (auth.uid() = user_id);
create policy "cashflow_plan_update_own"
  on public.cashflow_plan for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cashflow_plan_periods_select_own" on public.cashflow_plan_periods;
drop policy if exists "cashflow_plan_periods_insert_own" on public.cashflow_plan_periods;
drop policy if exists "cashflow_plan_periods_update_own" on public.cashflow_plan_periods;
drop policy if exists "cashflow_plan_periods_delete_own" on public.cashflow_plan_periods;
create policy "cashflow_plan_periods_select_own"
  on public.cashflow_plan_periods for select using (auth.uid() = user_id);
create policy "cashflow_plan_periods_insert_own"
  on public.cashflow_plan_periods for insert with check (auth.uid() = user_id);
create policy "cashflow_plan_periods_update_own"
  on public.cashflow_plan_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cashflow_plan_periods_delete_own"
  on public.cashflow_plan_periods for delete using (auth.uid() = user_id);
