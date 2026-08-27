-- Points payment (display-only monthly total; not in pace/budget graphs)
-- Also relax amount so points-only rows are allowed.

alter table public.daily_spend_entries
  add column if not exists points_amount integer not null default 0;

alter table public.daily_spend_entries
  drop constraint if exists daily_spend_entries_amount_check;

alter table public.daily_spend_entries
  add constraint daily_spend_entries_amount_nonneg
  check (amount >= 0);

alter table public.daily_spend_entries
  drop constraint if exists daily_spend_entries_points_amount_check;

alter table public.daily_spend_entries
  add constraint daily_spend_entries_points_nonneg
  check (points_amount >= 0);

alter table public.daily_spend_entries
  drop constraint if exists daily_spend_entries_cash_or_points_check;

alter table public.daily_spend_entries
  add constraint daily_spend_entries_cash_or_points_check
  check (amount > 0 or points_amount > 0);
