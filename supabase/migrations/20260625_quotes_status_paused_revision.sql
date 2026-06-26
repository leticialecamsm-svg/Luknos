-- Adiciona os novos valores de status ao CHECK constraint da tabela quotes
-- Se não houver constraint nomeado, esta migration apenas documenta os valores válidos.
-- Caso exista um CHECK constraint, remova e recrie:

ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_status_check
    CHECK (status IN ('queue', 'in_progress', 'paused', 'review', 'done', 'revision'));
