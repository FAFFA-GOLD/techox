-- Payslip import details (linked to the net-pay transaction)

create table if not exists public.payslip_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  payday date not null,
  target_label text not null,
  filename text,
  net_pay integer not null check (net_pay > 0),
  gross_pay integer,
  deduction_total integer,
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payslip_imports_user_payday_uidx
  on public.payslip_imports (user_id, payday);

create index if not exists payslip_imports_user_id_idx
  on public.payslip_imports (user_id);

create index if not exists payslip_imports_transaction_id_idx
  on public.payslip_imports (transaction_id);

alter table public.payslip_imports enable row level security;

create policy "payslip_imports_select_own"
  on public.payslip_imports for select
  using (auth.uid() = user_id);

create policy "payslip_imports_insert_own"
  on public.payslip_imports for insert
  with check (auth.uid() = user_id);

create policy "payslip_imports_update_own"
  on public.payslip_imports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "payslip_imports_delete_own"
  on public.payslip_imports for delete
  using (auth.uid() = user_id);
