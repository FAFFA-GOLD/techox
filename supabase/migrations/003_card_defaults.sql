-- Card planned amounts (run after 002_cashflow.sql)

alter table public.credit_cards
  add column if not exists default_one_time_amount integer not null default 0;

alter table public.credit_cards
  add column if not exists default_installment_amount integer not null default 0;
