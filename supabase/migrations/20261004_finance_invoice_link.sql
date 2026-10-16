-- Link finance_entries → purchase_invoices (boletos de NF-e)
-- e campos para "dar baixa" com detalhe de juros/multa/desconto/conta bancária

ALTER TABLE finance_entries
  ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_duplicata     TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS interest_amount      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_amount          NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_id           UUID REFERENCES finance_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_invoice ON finance_entries(purchase_invoice_id);
