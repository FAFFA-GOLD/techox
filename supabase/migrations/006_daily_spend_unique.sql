-- Prevent duplicate daily spend category names per user.
-- Clean up existing duplicates first (keep earliest created_at).

with ranked as (
  select
    id,
    user_id,
    name,
    row_number() over (
      partition by user_id, name
      order by created_at asc, id asc
    ) as rn
  from public.daily_spend_categories
),
dupes as (
  select id, user_id, name
  from ranked
  where rn > 1
),
keepers as (
  select id, user_id, name
  from ranked
  where rn = 1
)
update public.daily_spend_entries e
set category_id = k.id
from dupes d
join keepers k
  on k.user_id = d.user_id
 and k.name = d.name
where e.category_id = d.id;

delete from public.daily_spend_categories c
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, name
        order by created_at asc, id asc
      ) as rn
    from public.daily_spend_categories
  ) x
  where rn > 1
) d
where c.id = d.id;

create unique index if not exists daily_spend_categories_user_name_uidx
  on public.daily_spend_categories (user_id, name);
