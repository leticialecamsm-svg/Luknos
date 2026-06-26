-- Adiciona coluna para rastrear última promoção de temperatura (manual)
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS last_promoted_at TIMESTAMPTZ;

-- Também garante que last_auto_demoted_at existe
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS last_auto_demoted_at TIMESTAMPTZ;
