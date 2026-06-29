-- Adiciona flag de alerta em negociações
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS is_flagged_alert BOOLEAN DEFAULT FALSE;
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS flagged_alert_at TIMESTAMPTZ;
