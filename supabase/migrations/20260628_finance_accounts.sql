CREATE TABLE IF NOT EXISTS finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users manage accounts" ON finance_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insere as contas fixas
INSERT INTO finance_accounts (name, balance) VALUES
  ('Itaú', 0),
  ('C6 Bank', 0),
  ('BTG', 0),
  ('Rede', 0),
  ('Dinheiro', 0);
