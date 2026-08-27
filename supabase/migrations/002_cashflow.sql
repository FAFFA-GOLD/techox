-- Payday cycle, credit cards, loans (run after 001_initial.sql)

-- Allow day 1-31 on recurring rules (clamp to month-end in app)
alter table public.recurring_rules
  drop constraint if exists recurring_rules_day_of_month_check;

alter table public.recurring_rules
  add constraint recurring_rules_day_of_month_check
  check (day_of_month between 1 and 31);

-- User settings (payday) -----------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payday_type text not null default 'last_day'
    check (payday_type in ('last_day', 'fixed')),
  payday_day integer not null default 31
    check (payday_day between 1 and 31),
  updated_at timestamptz not null default now()
);

-- Credit cards ---------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  closing_day integer not null check (closing_day between 1 and 31),
  payment_day integer not null check (payment_day between 1 and 31),
  payment_month_offset integer not null default 1
    check (payment_month_offset between 0 and 2),
  default_one_time_amount integer not null default 0,
  default_installment_amount integer not null default 0,
  created_at timestamptz not null default now()
);

create index credit_cards_user_id_idx on public.credit_cards (user_id);

create table public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  payment_date date not null,
  one_time_amount integer not null default 0 check (one_time_amount >= 0),
  installment_amount integer not null default 0 check (installment_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, payment_date)
);

create index credit_card_payments_user_date_idx
  on public.credit_card_payments (user_id, payment_date);

create trigger credit_card_payments_set_updated_at
before update on public.credit_card_payments
for each row execute function public.set_updated_at();

-- Bank loans -----------------------------------------------------------------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  principal_amount integer not null default 0 check (principal_amount >= 0),
  interest_amount integer not null default 0 check (interest_amount >= 0),
  payment_day integer not null check (payment_day between 1 and 31),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

create index loans_user_id_idx on public.loans (user_id);

-- RLS ------------------------------------------------------------------------
alter table public.user_settings enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_payments enable row level security;
alter table public.loans enable row level security;

create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);

create policy "cards_select_own" on public.credit_cards
  for select using (auth.uid() = user_id);
create policy "cards_insert_own" on public.credit_cards
  for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on public.credit_cards
  for update using (auth.uid() = user_id);
create policy "cards_delete_own" on public.credit_cards
  for delete using (auth.uid() = user_id);

create policy "card_pay_select_own" on public.credit_card_payments
  for select using (auth.uid() = user_id);
create policy "card_pay_insert_own" on public.credit_card_payments
  for insert with check (auth.uid() = user_id);
create policy "card_pay_update_own" on public.credit_card_payments
  for update using (auth.uid() = user_id);
create policy "card_pay_delete_own" on public.credit_card_payments
  for delete using (auth.uid() = user_id);

create policy "loans_select_own" on public.loans
  for select using (auth.uid() = user_id);
create policy "loans_insert_own" on public.loans
  for insert with check (auth.uid() = user_id);
create policy "loans_update_own" on public.loans
  for update using (auth.uid() = user_id);
create policy "loans_delete_own" on public.loans
  for delete using (auth.uid() = user_id);
