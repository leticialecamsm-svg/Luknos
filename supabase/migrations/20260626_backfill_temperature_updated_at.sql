-- Backfill: corrige temperature_updated_at em negotiations usando o histórico de activities
-- A descrição das atividades de temperatura segue o padrão "Negociação {from} → {to}"

UPDATE negotiations n
SET temperature_updated_at = COALESCE(
  -- 1ª opção: última atividade de mudança de temperatura para o status atual
  (
    SELECT MAX(a.created_at)
    FROM activities a
    WHERE a.quote_id = n.quote_id
      AND a.description LIKE ('%→ ' || n.temperature)
  ),
  -- 2ª opção: data de criação da negociação / quote (quando nunca houve mudança de temperatura)
  n.created_at,
  NOW()
)
WHERE n.temperature NOT IN ('closed', 'lost');

-- Também popula neg_temperature_history com o histórico das activities existentes
-- (para negociações que ainda não têm histórico na nova tabela)
INSERT INTO neg_temperature_history (quote_id, from_temp, to_temp, auto_demoted, created_at, created_by)
SELECT DISTINCT ON (a.quote_id, a.created_at)
  a.quote_id,
  -- extrai "from" do padrão "Negociação {from} → {to}"
  TRIM(SPLIT_PART(REPLACE(a.description, 'Negociação ', ''), '→', 1)) AS from_temp,
  TRIM(SPLIT_PART(a.description, '→ ', 2)) AS to_temp,
  FALSE AS auto_demoted,
  a.created_at,
  a.user_id AS created_by
FROM activities a
WHERE a.description LIKE 'Negociação %→%'
  AND NOT EXISTS (
    SELECT 1 FROM neg_temperature_history h
    WHERE h.quote_id = a.quote_id
      AND ABS(EXTRACT(EPOCH FROM (h.created_at - a.created_at))) < 5
  )
ORDER BY a.quote_id, a.created_at;
