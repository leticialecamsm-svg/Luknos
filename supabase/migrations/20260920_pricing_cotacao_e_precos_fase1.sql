-- Cotação e Preços (Fase 1): fornecedores de precificação, métricas de fórmula,
-- grupos/tipos por NCM, cotações salvas e o "perfil de imposto" derivado do
-- histórico de compras (purchase_invoices/items reaproveitados).

create table public.pricing_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  region_label text,
  default_uf text,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.purchase_invoices
  add column pricing_supplier_id uuid references public.pricing_suppliers(id) on delete set null,
  add column uf_origem text,
  add column source text not null default 'nfe';
create index idx_purchase_invoices_pricing_supplier on public.purchase_invoices (pricing_supplier_id);
create index idx_purchase_invoice_items_ncm on public.purchase_invoice_items (ncm);

-- kind: price_percent (entra no divisor da venda), cost_percent (multiplica o custo),
-- unit_amount (R$ somado ao custo unitário), cash_discount (desconto do preço à vista).
create table public.pricing_metrics (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  kind text not null check (kind in ('price_percent','cost_percent','unit_amount','cash_discount')),
  default_value numeric(10,6) not null default 0,
  value_by_tipo jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pricing_product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ncm text not null,
  group_name text,
  sample_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (ncm, name)
);
create index idx_pricing_product_types_ncm on public.pricing_product_types (ncm);

create table public.pricing_quotes (
  id uuid primary key default gen_random_uuid(),
  number serial,
  supplier_id uuid references public.pricing_suppliers(id) on delete set null,
  mirror_supplier_id uuid references public.pricing_suppliers(id) on delete set null,
  supplier_label text,
  product_ref text,
  product_type text,
  ncm text not null,
  tipo_icms text,
  uf_origem text,
  quantity numeric(14,4) not null default 1,
  unit_price numeric(14,4) not null,
  ipi_pct numeric(10,6) not null default 0,
  icms_pct numeric(10,6) not null default 0,
  fecoep_pct numeric(10,6) not null default 0,
  metrics jsonb not null default '[]',
  cost_unit numeric(14,4) not null,
  price_credit numeric(14,4) not null,
  price_cash numeric(14,4),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_pricing_quotes_ncm on public.pricing_quotes (ncm);
create index idx_pricing_quotes_created on public.pricing_quotes (created_at desc);

-- Acesso só pelo servidor (service role), como as demais tabelas de compras.
alter table public.pricing_suppliers enable row level security;
alter table public.pricing_metrics enable row level security;
alter table public.pricing_product_types enable row level security;
alter table public.pricing_quotes enable row level security;

-- Métricas iniciais = as colunas O, P, Q, R e o desconto à vista da planilha.
insert into public.pricing_metrics (key, label, kind, default_value, value_by_tipo, sort_order) values
  ('maquineta', 'Taxa de maquineta (crédito 5x)', 'price_percent', 0.069, null, 10),
  ('imposto_tipo', 'Imposto ANT/ST', 'price_percent', 0.0345, '{"ST":0.0345,"ANT":0.0524}', 20),
  ('comissao', 'Comissão', 'price_percent', 0.125, null, 30),
  ('lucro', 'Lucro', 'price_percent', 0.33, null, 40),
  ('desc_avista', 'Desconto à vista', 'cash_discount', 0.10, null, 90);

-- Perfil de imposto: o "padrão" que hoje se copia à mão, por fornecedor x NCM x tipo x UF.
create view public.pricing_tax_profiles with (security_invoker = true) as
select
  p.pricing_supplier_id as supplier_id,
  i.ncm,
  upper(coalesce(i.tipo_icms, '')) as tipo,
  coalesce(p.uf_origem, '') as uf,
  count(*)::int as n,
  percentile_cont(0.5) within group (order by i.valor_icms / i.valor_total) as icms_pct,
  percentile_cont(0.5) within group (order by i.valor_fecoep / i.valor_total) as fecoep_pct,
  percentile_cont(0.5) within group (order by i.ipi_percent) as ipi_pct,
  max(p.data_emissao) as last_date
from public.purchase_invoice_items i
join public.purchase_invoices p on p.id = i.invoice_id
where p.pricing_supplier_id is not null and i.valor_total > 0 and i.ncm is not null
group by p.pricing_supplier_id, i.ncm, upper(coalesce(i.tipo_icms, '')), coalesce(p.uf_origem, '');
