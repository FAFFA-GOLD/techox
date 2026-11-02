-- 残高を保存し直した時刻。同じ日でも、これよりあとのデイリー入力はその部門から引く。
alter table public.account_balance_snapshots
  add column if not exists updated_at timestamptz;

update public.account_balance_snapshots
set updated_at = created_at
where updated_at is null;

alter table public.account_balance_snapshots
  alter column updated_at set default now();

alter table public.account_balance_snapshots
  alter column updated_at set not null;
