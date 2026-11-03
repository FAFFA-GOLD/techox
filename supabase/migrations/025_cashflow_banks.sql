-- あいち銀行とドコモ銀行のキャッシュフロー。
-- 開始残高は最初の給与期だけ。給料のうちあいち銀行へ残す額と、期末の調整は期ごと。

alter table public.cashflow_plan
  add column if not exists salary_retain integer not null default 60000 check (salary_retain >= 0),
  add column if not exists aichi_opening integer,
  add column if not exists docomo_opening integer,
  add column if not exists opening_period_start date;

alter table public.cashflow_plan_periods
  add column if not exists salary_retain integer check (salary_retain is null or salary_retain >= 0),
  add column if not exists aichi_adjustment integer not null default 0,
  add column if not exists docomo_adjustment integer not null default 0;
