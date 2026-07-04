-- Dados de folha de pagamento por colaborador/mês
-- Preenchido via upload do Extrato Mensal (PDF) ou manualmente

CREATE TABLE IF NOT EXISTS payroll_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  year        INT  NOT NULL,
  month       INT  NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',  -- nome como aparece no PDF
  salary_base        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_proventos    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_descontos    DECIMAL(10,2) NOT NULL DEFAULT 0,
  liquido            DECIMAL(10,2) NOT NULL DEFAULT 0,
  fgts               DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_items  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_data_year_month ON payroll_data(year, month);

-- RLS: apenas admins podem ver/editar
ALTER TABLE payroll_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_payroll" ON payroll_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
