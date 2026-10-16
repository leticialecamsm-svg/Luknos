-- Ciência da Operação (evento 210210) registrada pelo sistema na SEFAZ — sem
-- ela o DistDFe só devolve o resumo da NF recebida, sem itens nem XML completo.
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS ciencia_em TIMESTAMPTZ;
-- cStat/xMotivo do retorno; rejeição fica gravada pra não reenviar em loop
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS ciencia_cstat TEXT;
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS ciencia_motivo TEXT;
