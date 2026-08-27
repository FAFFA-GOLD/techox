-- Scratchpad is shared across all calendar months (one note per user)

alter table public.daily_scratchpads
  drop constraint if exists daily_scratchpads_month_key_check;

alter table public.daily_scratchpads
  add constraint daily_scratchpads_month_key_check
  check (month_key ~ '^\d{4}-\d{2}$' or month_key = 'shared');

-- Merge existing monthly notes into shared (keep newest body)
with ranked as (
  select
    user_id,
    body,
    updated_at,
    row_number() over (partition by user_id order by updated_at desc) as rn
  from public.daily_scratchpads
  where month_key <> 'shared'
)
insert into public.daily_scratchpads (user_id, month_key, body, updated_at)
select user_id, 'shared', body, updated_at
from ranked
where rn = 1
on conflict (user_id, month_key) do update
  set
    body = excluded.body,
    updated_at = excluded.updated_at
  where public.daily_scratchpads.updated_at < excluded.updated_at;

delete from public.daily_scratchpads
where month_key <> 'shared';
