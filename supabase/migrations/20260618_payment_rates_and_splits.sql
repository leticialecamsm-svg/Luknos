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
  ('pix',        'PIX',             0,    18.49, 1),
  ('debit',      'Débito',          1.40, 15.94, 2),
  ('credit_1x',  'Crédito à vista', 4.74,  9.13, 3),
  ('credit_2x',  '2x',              4.49,  9.65, 4),
  ('credit_3x',  '3x',              5.08,  8.39, 5),
  ('credit_4x',  '4x',              5.67,  7.11, 6),
  ('credit_5x',  '5x',              6.26,  5.79, 7),
  ('credit_6x',  '6x',              6.85,  4.43, 8),
  ('credit_7x',  '7x',              7.76,  2.36, 9),
  ('credit_8x',  '8x',              8.35,  0.96, 10),
  ('credit_9x',  '9x',              8.94,  0,    11),
  ('credit_10x', '10x',             9.53,  0,    12)
ON CONFLICT (method_key) DO NOTHING;

-- Add payment_splits to negotiations (array of {method_key, amount})
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb;
