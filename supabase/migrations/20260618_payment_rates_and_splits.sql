-- Table for configurable payment method rates (admin-editable)
CREATE TABLE IF NOT EXISTS payment_method_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  machine_fee_pct NUMERIC(6,4) NOT NULL DEFAULT 0,
  max_discount_pct NUMERIC(6,4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: everyone reads, only admin writes (enforced in app layer via admin client)
ALTER TABLE payment_method_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow read" ON payment_method_rates FOR SELECT USING (true);

-- Seed default rates
INSERT INTO payment_method_rates (method_key, label, machine_fee_pct, max_discount_pct, sort_order) VALUES
  ('pix',        'PIX',             0,    13.38, 1),
  ('cash',       'Dinheiro',        0,    13.38, 2),
  ('debit',      'Débito',          1.40, 10.67, 3),
  ('credit_1x',  'Crédito à vista', 4.74,  3.44, 4),
  ('credit_2x',  '2x',              4.49,  3.99, 5),
  ('credit_3x',  '3x',              5.08,  2.65, 6),
  ('credit_4x',  '4x',              5.67,  1.28, 7),
  ('credit_5x',  '5x',              6.26,  0,    8),
  ('credit_6x',  '6x',              6.85,  0,    9)
ON CONFLICT (method_key) DO NOTHING;

-- Add payment_splits to negotiations (array of {method_key, amount})
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb;
