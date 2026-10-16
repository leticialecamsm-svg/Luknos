-- Quem/onde originou cada consulta ao DistDFe da SEFAZ: ajuda a separar o consumo
-- da cota de 20/hora que vem do sistema do que vem de outros usuários do certificado.
ALTER TABLE sefaz_dist_calls ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE sefaz_dist_calls ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE sefaz_dist_calls ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE sefaz_dist_calls ADD COLUMN IF NOT EXISTS chave_nfe text;
ALTER TABLE sefaz_dist_calls ADD COLUMN IF NOT EXISTS cstat text;
