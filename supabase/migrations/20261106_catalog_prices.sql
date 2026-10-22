-- Preço de venda de cada produto do catálogo dos fornecedores, tirado da compra mais
-- recente dele em Cotação e Preços (purchase_invoice_items.preco_credito, casado ao
-- catálogo pelo mesmo casamento da foto). Reconstruída pelo cron diário
-- /api/cron/catalog-prices e pelo botão "Atualizar preços" do Orçamento de Produtos.
CREATE TABLE IF NOT EXISTS catalog_prices (
  source text NOT NULL,
  ref text NOT NULL,
  price numeric NOT NULL,          -- preço de venda unitário (crédito)
  cost numeric,                    -- custo unitário da mesma compra
  invoice_date date,
  invoice_number text,
  supplier_desc text,              -- descrição do item na nota
  match text NOT NULL,             -- codigo | descricao | manual | nome (nome = palpite)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, ref)
);

ALTER TABLE catalog_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_prices_admin_read ON catalog_prices
  FOR SELECT TO authenticated USING (public.wa_is_admin());
