-- Orçamento de Produtos (/propostas): proposta para o cliente montada com os
-- produtos do catálogo dos fornecedores (supplier_catalog_products), agrupados
-- por ambiente. Só admin. O documento inteiro (ambientes + itens) fica em
-- `rooms` e é salvo de uma vez pela tela de edição.
CREATE TABLE IF NOT EXISTS product_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number serial UNIQUE,
  client_name text NOT NULL DEFAULT '',
  client_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  architect_name text,
  architect_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  proposal_date date NOT NULL DEFAULT current_date,
  valid_days integer,
  payment_terms text,
  -- desconto no total: 'percent' (valor = 10 → 10%) ou 'value' (R$)
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'value')),
  discount_value numeric NOT NULL DEFAULT 0,
  notes text,
  -- [{ id, name, items: [{ id, catalog_id, source, ref, name, image_url, qty, unit_price, note }] }]
  rooms jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- o que sai no PDF: { images, prices, discount, room_totals, notes }
  print_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- total final (com desconto), guardado para a listagem
  total numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_proposals_created ON product_proposals(created_at DESC);

ALTER TABLE product_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_proposals_admin ON product_proposals
  FOR ALL TO authenticated USING (public.wa_is_admin()) WITH CHECK (public.wa_is_admin());
