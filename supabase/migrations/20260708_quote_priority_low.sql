-- Adiciona o valor 'low' (Baixa) ao enum de prioridade dos orçamentos.
-- O frontend oferece "Baixa" (e usa como default), mas o enum só tinha normal/high/urgent,
-- causando "invalid input value for enum quote_priority: low" ao criar orçamento.
ALTER TYPE quote_priority ADD VALUE IF NOT EXISTS 'low' BEFORE 'normal';
