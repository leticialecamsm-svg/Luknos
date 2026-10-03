-- Fotos de catálogo dos fornecedores (começa pela Accord): uma linha por referência,
-- copiada do site do fabricante por /api/cron/supplier-catalog. A foto principal fica
-- no bucket público 'supplier-catalog'; as fotos por acabamento apontam pro site.

create table public.supplier_catalog_products (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'accord'
  ref text not null,                    -- '1145'
  source_product_id text not null,      -- id do produto no site (várias refs podem dividir a mesma foto)
  name text not null,                   -- 'Pendente Accord Cônico'
  kind text,                            -- pendente | arandela | abajur | coluna | plafon | ...
  line text,                            -- 'conica'
  altura_cm numeric(8,2),
  largura_cm numeric(8,2),
  profundidade_cm numeric(8,2),
  diametro_cm numeric(8,2),
  product_url text,
  image_url text,                       -- URL pública no Storage
  source_image_url text,
  finishes jsonb not null default '[]', -- [{ code: '48', name: 'Lâmina Tingida Cappuccino', url }]
  updated_at timestamptz not null default now(),
  unique (source, ref)
);
create index idx_supplier_catalog_products_source on public.supplier_catalog_products (source);
alter table public.supplier_catalog_products enable row level security;
-- sem policies: só o servidor (service role) lê/escreve, como as demais tabelas de compras.

-- Foto escolhida à mão para o item da nota: ref do catálogo, ou '-' para "sem foto".
alter table public.purchase_invoice_items add column if not exists catalog_ref text;

insert into storage.buckets (id, name, public)
values ('supplier-catalog', 'supplier-catalog', true)
on conflict (id) do nothing;
