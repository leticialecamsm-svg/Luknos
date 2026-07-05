-- Notas de entrada com dados de imposto da SEFAZ AL
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_nfe TEXT NOT NULL,
  numero_nota TEXT,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  data_emissao DATE,
  -- Parâmetros de precificação (editáveis por nota)
  comissao DECIMAL(6,4) NOT NULL DEFAULT 0.1250,
  lucro DECIMAL(6,4) NOT NULL DEFAULT 0.3300,
  maquininha DECIMAL(6,4) NOT NULL DEFAULT 0.0690,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chave_nfe)
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  numero_item INT NOT NULL,
  -- Dados da nota fiscal (entrada manual ou via XML)
  descricao TEXT NOT NULL DEFAULT '',
  ncm TEXT,
  codigo_produto TEXT,
  quantidade DECIMAL(10,4) NOT NULL DEFAULT 0,
  valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  ipi_percent DECIMAL(6,4) NOT NULL DEFAULT 0,
  -- Dados da SEFAZ (automático)
  tipo_icms TEXT,
  valor_icms DECIMAL(10,2) NOT NULL DEFAULT 0,
  valor_fecoep DECIMAL(10,2) NOT NULL DEFAULT 0,
  aliquota_icms DECIMAL(6,4),
  aliquota_fecoep DECIMAL(6,4),
  mva_valor DECIMAL(8,4),
  -- Calculados e armazenados
  custo_unitario DECIMAL(10,2),
  preco_credito DECIMAL(10,2),
  imposto_ant_percent DECIMAL(6,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_invoices" ON purchase_invoices
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_write_invoices" ON purchase_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "auth_read_invoice_items" ON purchase_invoice_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins_write_invoice_items" ON purchase_invoice_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
