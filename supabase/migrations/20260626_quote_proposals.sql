CREATE TABLE IF NOT EXISTS quote_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  value NUMERIC(12,2) NOT NULL,
  date DATE,
  info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_proposals_quote_id ON quote_proposals(quote_id);
-- RLS permissivo (igual a quotes)
ALTER TABLE quote_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated" ON quote_proposals FOR ALL TO authenticated USING(true) WITH CHECK(true);
