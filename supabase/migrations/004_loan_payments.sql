-- Loan payment confirmations (run after 003)

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  loan_id uuid not null references public.loans (id) on delete cascade,
  payment_date date not null,
  principal_amount integer not null default 0 check (principal_amount >= 0),
  interest_amount integer not null default 0 check (interest_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, payment_date)
);

create index loan_payments_user_date_idx
  on public.loan_payments (user_id, payment_date);

create trigger loan_payments_set_updated_at
before update on public.loan_payments
for each row execute function public.set_updated_at();

alter table public.loan_payments enable row level security;

create policy "loan_pay_select_own" on public.loan_payments
  for select using (auth.uid() = user_id);
create policy "loan_pay_insert_own" on public.loan_payments
  for insert with check (auth.uid() = user_id);
create policy "loan_pay_update_own" on public.loan_payments
  for update using (auth.uid() = user_id);
create policy "loan_pay_delete_own" on public.loan_payments
  for delete using (auth.uid() = user_id);
