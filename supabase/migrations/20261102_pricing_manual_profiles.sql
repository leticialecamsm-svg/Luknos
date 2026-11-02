-- Perfil de imposto cadastrado à mão por fornecedor (NCM + tipo ST/ANT + %).
-- Vale quando o fornecedor ainda não tem nota com aquele NCM, ou quando se quer
-- fixar o percentual; tem prioridade sobre o que vem das notas.
create table public.pricing_manual_profiles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.pricing_suppliers(id) on delete cascade,
  ncm text not null check (ncm ~ '^[0-9]{8}$'),
  name text,                       -- tipo/nome do produto, só para achar na busca
  tipo text not null default '' ,  -- 'ST' | 'ANT'
  uf text not null default '',
  icms_pct numeric(10,6) not null default 0,
  fecoep_pct numeric(10,6) not null default 0,
  ipi_pct numeric(10,6) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (supplier_id, ncm, tipo, uf)
);
alter table public.pricing_manual_profiles enable row level security;
