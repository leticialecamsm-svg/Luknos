-- Hevvy: o catálogo identifica o produto pelo código de modelo (SL-5910L/W2 BK) e EAN, além da Ref.
alter table public.supplier_catalog_products add column if not exists model text, add column if not exists ean text;
