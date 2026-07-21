-- Leads recebidos pelo formulário "Solicite seu orçamento" do site público
CREATE TABLE IF NOT EXISTS site_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  has_project BOOLEAN NOT NULL,
  wants_visit BOOLEAN,
  segment TEXT NOT NULL CHECK (segment IN ('residencial', 'comercial')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'convertido', 'descartado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_leads_created_at ON site_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_leads_status ON site_leads(status);

ALTER TABLE site_leads ENABLE ROW LEVEL SECURITY;

-- Público (site) pode inserir, mas não ler/alterar/apagar
CREATE POLICY "site_leads_public_insert" ON site_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Usuários autenticados do sistema interno podem ler e gerenciar
CREATE POLICY "site_leads_authenticated_select" ON site_leads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "site_leads_authenticated_update" ON site_leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "site_leads_authenticated_delete" ON site_leads
  FOR DELETE
  TO authenticated
  USING (true);
