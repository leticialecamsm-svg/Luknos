-- Vincula lançamentos financeiros a uma venda/split específico, para que valores
-- "em aberto" de uma venda fechada apareçam automaticamente como Contas a Receber,
-- e sejam sincronizados (criados/baixados/removidos) quando o pagamento mudar na tela da venda.
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS payment_split_index INT;

CREATE INDEX IF NOT EXISTS idx_finance_entries_quote_id ON finance_entries(quote_id);
