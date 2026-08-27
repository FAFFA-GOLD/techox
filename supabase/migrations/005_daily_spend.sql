-- Daily spend calendar (calendar month budgets)

create table public.daily_spend_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  monthly_budget integer not null default 0 check (monthly_budget >= 0),
  color text not null default '#0f766e',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index daily_spend_categories_user_id_idx
  on public.daily_spend_categories (user_id);

create table public.daily_spend_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.daily_spend_categories (id) on delete cascade,
  date date not null,
  amount integer not null check (amount > 0),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_spend_entries_user_date_idx
  on public.daily_spend_entries (user_id, date);

create trigger daily_spend_entries_set_updated_at
before update on public.daily_spend_entries
for each row execute function public.set_updated_at();

alter table public.daily_spend_categories enable row level security;
alter table public.daily_spend_entries enable row level security;

create policy "dsc_select_own" on public.daily_spend_categories
  for select using (auth.uid() = user_id);
create policy "dsc_insert_own" on public.daily_spend_categories
  for insert with check (auth.uid() = user_id);
create policy "dsc_update_own" on public.daily_spend_categories
  for update using (auth.uid() = user_id);
create policy "dsc_delete_own" on public.daily_spend_categories
  for delete using (auth.uid() = user_id);

create policy "dse_select_own" on public.daily_spend_entries
  for select using (auth.uid() = user_id);
create policy "dse_insert_own" on public.daily_spend_entries
  for insert with check (auth.uid() = user_id);
create policy "dse_update_own" on public.daily_spend_entries
  for update using (auth.uid() = user_id);
create policy "dse_delete_own" on public.daily_spend_entries
  for delete using (auth.uid() = user_id);
