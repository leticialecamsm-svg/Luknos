-- Backfill commissions for closed sales that have a partner with commission_rate > 0
-- This handles sales closed before the commission system was implemented

INSERT INTO commissions (contact_id, quote_id, quote_value, rate, amount, due_date, status)
SELECT
  q.architect_id                                                        AS contact_id,
  q.id                                                                  AS quote_id,
  COALESCE(q.final_value, q.quoted_value, 0)                           AS quote_value,
  c.commission_rate                                                      AS rate,
  ROUND(
    (COALESCE(q.final_value, q.quoted_value, 0) * c.commission_rate / 100)::numeric,
    2
  )                                                                      AS amount,
  (
    COALESCE(q.closed_at, CURRENT_DATE) + INTERVAL '30 days'
  )::date                                                                AS due_date,
  CASE
    WHEN (COALESCE(q.closed_at, CURRENT_DATE) + INTERVAL '30 days') < CURRENT_DATE
      THEN 'overdue'
    ELSE 'scheduled'
  END                                                                    AS status
FROM quotes q
JOIN contacts c ON c.id = q.architect_id
WHERE q.temperature = 'closed'
  AND q.architect_id IS NOT NULL
  AND c.commission_rate IS NOT NULL
  AND c.commission_rate > 0
ON CONFLICT (quote_id, contact_id) DO NOTHING;
