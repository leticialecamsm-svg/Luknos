-- Novo valor de temperatura
ALTER TYPE neg_temperature ADD VALUE IF NOT EXISTS 'no_forecast';

-- Colunas de controle de tempo na tabela negotiations
ALTER TABLE negotiations
  ADD COLUMN IF NOT EXISTS temperature_updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_auto_demoted_at TIMESTAMPTZ;

-- Tabela de histórico de temperatura
CREATE TABLE IF NOT EXISTS neg_temperature_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  from_temp VARCHAR(20),
  to_temp VARCHAR(20) NOT NULL,
  auto_demoted BOOLEAN DEFAULT FALSE,
  reason VARCHAR(50),
  reason_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_neg_temp_history_quote_id ON neg_temperature_history(quote_id);
ALTER TABLE neg_temperature_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated" ON neg_temperature_history
  FOR ALL TO authenticated USING(true) WITH CHECK(true);
