-- Guarda estado de sincronização com o DistDFe (último NSU consultado)
CREATE TABLE IF NOT EXISTS nfe_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  ultimo_nsu TEXT NOT NULL DEFAULT '0',
  max_nsu TEXT NOT NULL DEFAULT '0',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de NF-es recebidas pelo DistDFe ainda não adicionadas ao sistema
CREATE TABLE IF NOT EXISTS nfe_received (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_nfe TEXT NOT NULL UNIQUE,
  numero_nota TEXT,
  data_emissao DATE,
  fornecedor_cnpj TEXT,
  fornecedor_nome TEXT,
  valor_total DECIMAL(12,2),
  transportadora_cnpj TEXT,
  transportadora_nome TEXT,
  nsu TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nfe_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_received ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_sync_state" ON nfe_sync_state
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "auth_read_nfe_received" ON nfe_received
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admins_write_nfe_received" ON nfe_received
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO nfe_sync_state (id, ultimo_nsu, max_nsu) VALUES ('default', '0', '0')
  ON CONFLICT (id) DO NOTHING;
