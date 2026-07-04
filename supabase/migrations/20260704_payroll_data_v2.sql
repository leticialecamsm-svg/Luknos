-- Adiciona campos de VT e URL do recibo individual na tabela de folha
ALTER TABLE payroll_data ADD COLUMN IF NOT EXISTS vt_next_month DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_data ADD COLUMN IF NOT EXISTS receipt_url TEXT;
