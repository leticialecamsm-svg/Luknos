-- Módulo Financeiro: lançamentos (contas a pagar/receber), parcelamento, status
CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description       TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'payable' CHECK (type IN ('payable','receivable')),
  category          TEXT,
  counterparty      TEXT,                      -- fornecedor / cliente
  amount            NUMERIC(12,2) NOT NULL,
  due_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at           DATE,
  group_id          UUID,                      -- agrupa parcelas (30/60/90)
  installment_number INT,
  installments_total INT,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_due_date ON finance_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_status ON finance_entries(status);
CREATE INDEX IF NOT EXISTS idx_finance_group ON finance_entries(group_id);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_auth_all" ON finance_entries;
CREATE POLICY "finance_auth_all" ON finance_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
