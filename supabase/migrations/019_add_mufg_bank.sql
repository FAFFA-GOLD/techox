-- Add default secondary bank: 三菱東京UFJ銀行 (not main)

insert into public.asset_accounts (user_id, name, kind, is_main, sort_order)
select
  u.id,
  '三菱東京UFJ銀行',
  'bank',
  false,
  coalesce(
    (
      select max(a.sort_order) + 1
      from public.asset_accounts a
      where a.user_id = u.id
    ),
    1
  )
from auth.users u
where not exists (
  select 1
  from public.asset_accounts a
  where a.user_id = u.id
    and a.name = '三菱東京UFJ銀行'
);
