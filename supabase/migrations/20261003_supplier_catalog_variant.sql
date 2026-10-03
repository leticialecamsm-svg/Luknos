-- Cor/acabamento do produto como vem no catálogo ('BRANCO', 'PRETO, BRANCO, DOURADO'):
-- desempata variantes quando a nota traz só o nome e a cor.
alter table public.supplier_catalog_products add column if not exists variant text;
