-- Named ledger scenarios for same-account A/B verification
-- Live tables hold the active scenario; inactive scenarios store LedgerBackup JSON in payload.

create table if not exists public.ledger_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_main boolean not null default false,
  is_active boolean not null default false,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_scenarios_user_id_idx
  on public.ledger_scenarios (user_id);

create unique index if not exists ledger_scenarios_one_active_per_user
  on public.ledger_scenarios (user_id)
  where is_active;

create unique index if not exists ledger_scenarios_one_main_per_user
  on public.ledger_scenarios (user_id)
  where is_main;

alter table public.ledger_scenarios enable row level security;

create policy "ledger_scenarios_select_own"
  on public.ledger_scenarios for select
  using (auth.uid() = user_id);

create policy "ledger_scenarios_insert_own"
  on public.ledger_scenarios for insert
  with check (auth.uid() = user_id);

create policy "ledger_scenarios_update_own"
  on public.ledger_scenarios for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ledger_scenarios_delete_own"
  on public.ledger_scenarios for delete
  using (auth.uid() = user_id);
