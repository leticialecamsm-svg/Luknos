-- Rastreia o PDF original enviado por mês (Recibo de Pagamento)
CREATE TABLE IF NOT EXISTS payroll_month_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

ALTER TABLE payroll_month_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_payroll_uploads" ON payroll_month_uploads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
