-- Cor e descrição das linhas editoriais
ALTER TABLE marketing_editorial_lines ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE marketing_editorial_lines ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill de cores para linhas já existentes (paleta rotativa por ordem de criação)
WITH ordered AS (
  SELECT id, (row_number() OVER (ORDER BY created_at)) - 1 AS rn
  FROM marketing_editorial_lines
)
UPDATE marketing_editorial_lines m
SET color = (ARRAY['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EF4444','#14B8A6','#F97316','#A855F7','#0EA5E9','#84CC16'])[(o.rn % 12) + 1]
FROM ordered o
WHERE m.id = o.id AND m.color IS NULL;
