-- Vínculo entre mensagens do CRM e etapas de solicitações
CREATE TABLE IF NOT EXISTS crm_solicitation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitation_id uuid NOT NULL REFERENCES solicitations(id) ON DELETE CASCADE,
  stage text NOT NULL,
  crm_message_id uuid NOT NULL REFERENCES crm_messages(id) ON DELETE CASCADE,
  field text NOT NULL DEFAULT 'observation',
  -- 'file' = arquivo/mídia, 'observation' = texto/obs, 'location' = localização, 'contact' = cartão de contato
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_solic_links_solic ON crm_solicitation_links(solicitation_id);
CREATE INDEX IF NOT EXISTS idx_crm_solic_links_msg ON crm_solicitation_links(crm_message_id);

ALTER TABLE crm_solicitation_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_solicitation_links_all_auth ON crm_solicitation_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
