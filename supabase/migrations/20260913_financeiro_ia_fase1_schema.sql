-- Luknos Financeiro Inteligente (pacote Viver de IA) — Fase 1: Fundação.
-- Schema fiel a `docs/financeiro-ia/db/schemas.sql` do pacote recebido em
-- 2026-09-13. Roda no MESMO projeto Supabase do Luknos (dpobbflxgrjbfpxmtehg),
-- mas em tabelas próprias (profiles, bank_accounts, categories, suppliers,
-- cost_centers, recurrences, sales, transactions, transaction_installments,
-- csv_imports, approval_settings, whatsapp_summary_log, ai_insights,
-- ai_chat_messages) — nenhuma colide com o schema existente do ERP.
--
-- Nota importante (ver SKILL.md do pacote, "Não trate as vendas como fonte
-- externa"): a tabela `sales` aqui é a do pacote (reentrada manual pelo
-- vendedor). O Luknos já tem `quotes`/`negotiations` com o fechamento de
-- venda completo (closeSale) — a integração real da Fase 2 deve puxar DE LÁ
-- para dentro de `transactions` (a_receber), não duplicar a digitação numa
-- nova tabela `sales`. Decisão de produto pendente antes da Fase 2, item 7.
--
-- Aplicado em produção via mcp Supabase em 4 migrações (p1..p4) por causa de
-- uma dependência de ordem: funções `language sql` (auth_role/is_gestor/
-- can_approve_flag) validam a existência de `profiles` na criação, então a
-- tabela precisa existir antes delas — diferente da ordem original do
-- pacote (funções primeiro). Este arquivo já reflete a ordem corrigida.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'colaborador',
  can_approve boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_role on public.profiles (role);
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('gestora','socio_gestor') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_approve_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_approve from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_gestor());
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_gestor());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_gestor()) with check (id = auth.uid() or public.is_gestor());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_gestor());

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bank_code text,
  account_type text not null default 'corrente',
  current_balance numeric(14,2) not null default 0,
  status text not null default 'ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_bank_accounts_status on public.bank_accounts (status);
create trigger trg_bank_accounts_updated_at before update on public.bank_accounts for each row execute function public.set_updated_at();
alter table public.bank_accounts enable row level security;
create policy bank_accounts_select on public.bank_accounts for select to authenticated using (true);
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated with check (public.is_gestor());
create policy bank_accounts_update on public.bank_accounts for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy bank_accounts_delete on public.bank_accounts for delete to authenticated using (public.is_gestor());

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_categories_kind on public.categories (kind);
create trigger trg_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
alter table public.categories enable row level security;
create policy categories_select on public.categories for select to authenticated using (true);
create policy categories_insert on public.categories for insert to authenticated with check (public.is_gestor());
create policy categories_update on public.categories for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy categories_delete on public.categories for delete to authenticated using (public.is_gestor());

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_suppliers_document on public.suppliers (document);
create trigger trg_suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated using (true);
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.is_gestor() or public.auth_role() = 'colaborador_logistica');
create policy suppliers_update on public.suppliers for update to authenticated using (public.is_gestor() or public.auth_role() = 'colaborador_logistica') with check (public.is_gestor() or public.auth_role() = 'colaborador_logistica');
create policy suppliers_delete on public.suppliers for delete to authenticated using (public.is_gestor());

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_cost_centers_updated_at before update on public.cost_centers for each row execute function public.set_updated_at();
alter table public.cost_centers enable row level security;
create policy cost_centers_select on public.cost_centers for select to authenticated using (true);
create policy cost_centers_insert on public.cost_centers for insert to authenticated with check (public.is_gestor());
create policy cost_centers_update on public.cost_centers for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy cost_centers_delete on public.cost_centers for delete to authenticated using (public.is_gestor());

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  direction text not null,
  amount numeric(14,2) not null,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  frequency text not null,
  day_of_month int,
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_recurrences_active on public.recurrences (is_active);
create index idx_recurrences_category on public.recurrences (category_id);
create index idx_recurrences_supplier on public.recurrences (supplier_id);
create index idx_recurrences_cost_center on public.recurrences (cost_center_id);
create index idx_recurrences_bank_account on public.recurrences (bank_account_id);
create trigger trg_recurrences_updated_at before update on public.recurrences for each row execute function public.set_updated_at();
alter table public.recurrences enable row level security;
create policy recurrences_select on public.recurrences for select to authenticated using (true);
create policy recurrences_insert on public.recurrences for insert to authenticated with check (public.is_gestor());
create policy recurrences_update on public.recurrences for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy recurrences_delete on public.recurrences for delete to authenticated using (public.is_gestor());

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  customer_name text,
  total_amount numeric(14,2) not null,
  payment_method text,
  installments int not null default 1,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sales_sale_date on public.sales (sale_date);
create index idx_sales_created_by on public.sales (created_by);
create index idx_sales_bank_account on public.sales (bank_account_id);
create trigger trg_sales_updated_at before update on public.sales for each row execute function public.set_updated_at();
alter table public.sales enable row level security;
create policy sales_select on public.sales for select to authenticated using (public.is_gestor() or created_by = auth.uid());
create policy sales_insert on public.sales for insert to authenticated with check (public.is_gestor() or public.auth_role() = 'colaborador_venda');
create policy sales_update on public.sales for update to authenticated using (public.is_gestor() or (created_by = auth.uid() and sale_date = current_date)) with check (public.is_gestor() or (created_by = auth.uid() and sale_date = current_date));
create policy sales_delete on public.sales for delete to authenticated using (public.is_gestor());

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  direction text not null,
  description text not null,
  amount numeric(14,2) not null,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  due_date date not null,
  paid_date date,
  status text not null default 'pendente',
  is_complete boolean not null default false,
  recurrence_id uuid references public.recurrences(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  import_hash text,
  nfe_attachment_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_transactions_import_hash on public.transactions (import_hash);
create index idx_transactions_due_date on public.transactions (due_date);
create index idx_transactions_status on public.transactions (status);
create index idx_transactions_direction on public.transactions (direction);
create index idx_transactions_category on public.transactions (category_id);
create index idx_transactions_cost_center on public.transactions (cost_center_id);
create index idx_transactions_bank_account on public.transactions (bank_account_id);
create index idx_transactions_supplier on public.transactions (supplier_id);
create index idx_transactions_recurrence on public.transactions (recurrence_id);
create index idx_transactions_sale on public.transactions (sale_id);
create index idx_transactions_created_by on public.transactions (created_by);
create trigger trg_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
alter table public.transactions enable row level security;
create policy transactions_select on public.transactions for select to authenticated using (
  public.is_gestor()
  or created_by = auth.uid()
  or (public.auth_role() = 'colaborador_logistica' and direction = 'a_pagar')
  or (public.auth_role() = 'colaborador_venda' and direction = 'a_receber')
);
create policy transactions_insert on public.transactions for insert to authenticated with check (
  public.is_gestor()
  or (public.auth_role() = 'colaborador_logistica' and direction = 'a_pagar')
  or (public.auth_role() = 'colaborador_venda' and direction = 'a_receber')
);
create policy transactions_update on public.transactions for update to authenticated using (
  public.is_gestor()
  or public.can_approve_flag()
  or (created_by = auth.uid() and status not in ('aprovado','pago'))
) with check (
  public.is_gestor()
  or public.can_approve_flag()
  or (created_by = auth.uid() and status not in ('aprovado','pago'))
);
create policy transactions_delete on public.transactions for delete to authenticated using (public.is_gestor());

create table public.transaction_installments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  installment_number int not null,
  total_installments int not null,
  amount numeric(14,2) not null,
  due_date date not null,
  status text not null default 'pendente',
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_installments_transaction on public.transaction_installments (transaction_id);
create index idx_installments_due_date on public.transaction_installments (due_date);
create trigger trg_installments_updated_at before update on public.transaction_installments for each row execute function public.set_updated_at();
alter table public.transaction_installments enable row level security;
create policy installments_select on public.transaction_installments for select to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and (
    public.is_gestor()
    or t.created_by = auth.uid()
    or (public.auth_role() = 'colaborador_logistica' and t.direction = 'a_pagar')
    or (public.auth_role() = 'colaborador_venda' and t.direction = 'a_receber')
  ))
);
create policy installments_insert on public.transaction_installments for insert to authenticated with check (
  exists (select 1 from public.transactions t where t.id = transaction_id and (
    public.is_gestor() or t.created_by = auth.uid()
  ))
);
create policy installments_update on public.transaction_installments for update to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and (
    public.is_gestor() or public.can_approve_flag() or (t.created_by = auth.uid() and t.status not in ('aprovado','pago'))
  ))
) with check (
  exists (select 1 from public.transactions t where t.id = transaction_id and (
    public.is_gestor() or public.can_approve_flag() or (t.created_by = auth.uid() and t.status not in ('aprovado','pago'))
  ))
);
create policy installments_delete on public.transaction_installments for delete to authenticated using (public.is_gestor());

create table public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_skipped_duplicate int not null default 0,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_csv_imports_created_at on public.csv_imports (created_at);
create index idx_csv_imports_imported_by on public.csv_imports (imported_by);
alter table public.csv_imports enable row level security;
create policy csv_imports_select on public.csv_imports for select to authenticated using (public.is_gestor() or public.auth_role() = 'colaborador_logistica');
create policy csv_imports_insert on public.csv_imports for insert to authenticated with check (public.is_gestor() or public.auth_role() = 'colaborador_logistica');

create table public.approval_settings (
  id uuid primary key default gen_random_uuid(),
  approval_threshold numeric(14,2) not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_approval_settings_updated_at before update on public.approval_settings for each row execute function public.set_updated_at();
alter table public.approval_settings enable row level security;
create policy approval_settings_select on public.approval_settings for select to authenticated using (true);
create policy approval_settings_insert on public.approval_settings for insert to authenticated with check (public.is_gestor());
create policy approval_settings_update on public.approval_settings for update to authenticated using (public.is_gestor()) with check (public.is_gestor());

create table public.whatsapp_summary_log (
  id uuid primary key default gen_random_uuid(),
  summary_date date not null,
  payload jsonb not null,
  sent boolean not null default false,
  skipped_reason text,
  created_at timestamptz not null default now()
);
create unique index idx_whatsapp_summary_date on public.whatsapp_summary_log (summary_date);
alter table public.whatsapp_summary_log enable row level security;
create policy whatsapp_summary_select on public.whatsapp_summary_log for select to authenticated using (public.is_gestor());

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  insight_type text not null,
  title text not null,
  body text not null,
  reference_period text,
  is_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_insights_created_at on public.ai_insights (created_at);
create trigger trg_ai_insights_updated_at before update on public.ai_insights for each row execute function public.set_updated_at();
alter table public.ai_insights enable row level security;
create policy ai_insights_select on public.ai_insights for select to authenticated using (public.is_gestor());
create policy ai_insights_update on public.ai_insights for update to authenticated using (public.is_gestor()) with check (public.is_gestor());

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index idx_ai_chat_user on public.ai_chat_messages (user_id, created_at);
alter table public.ai_chat_messages enable row level security;
create policy ai_chat_select on public.ai_chat_messages for select to authenticated using (user_id = auth.uid());
create policy ai_chat_insert on public.ai_chat_messages for insert to authenticated with check (user_id = auth.uid());
