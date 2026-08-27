-- Lunch menu candidates for 昼食計算 (store / dish / price)

create table if not exists public.lunch_menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_name text not null default '',
  item_name text not null default '',
  amount integer not null check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lunch_menu_items_user_sort_idx
  on public.lunch_menu_items (user_id, sort_order, created_at);

alter table public.lunch_menu_items enable row level security;

create policy "lunch_menu_items_select_own"
  on public.lunch_menu_items for select
  using (auth.uid() = user_id);

create policy "lunch_menu_items_insert_own"
  on public.lunch_menu_items for insert
  with check (auth.uid() = user_id);

create policy "lunch_menu_items_update_own"
  on public.lunch_menu_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "lunch_menu_items_delete_own"
  on public.lunch_menu_items for delete
  using (auth.uid() = user_id);
