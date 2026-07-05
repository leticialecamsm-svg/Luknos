-- Cache dos itens da NF-e para evitar consulta ao vivo na SEFAZ (limite de 20/hora)
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS items_json JSONB;
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS tem_xml_completo BOOLEAN DEFAULT FALSE;
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS xml_fetched_at TIMESTAMPTZ;
