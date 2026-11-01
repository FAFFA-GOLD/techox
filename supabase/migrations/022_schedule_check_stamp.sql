-- 先の取引の不足確認を、日本時間で1日1回にする。
-- 列が無いあいだは、これまでどおり開くたびに確認する。

alter table public.user_settings
  add column if not exists schedules_checked_on date;
