-- XML completo (nfeProc) da NF-e recebida, guardado pra gerar o DANFE sem
-- gastar outra consulta à SEFAZ (limite de 20/hora).
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS xml_nfe TEXT;
-- true depois que o XML foi convertido no Meu Danfe: a partir daí o PDF é
-- baixado de lá por chave (grátis), sem reenviar o XML — reenvios repetidos
-- do mesmo XML bloqueiam a conta na API deles.
ALTER TABLE nfe_received ADD COLUMN IF NOT EXISTS danfe_meudanfe BOOLEAN NOT NULL DEFAULT FALSE;

-- Api-Key do Meu Danfe (geração do DANFE das NFs recebidas), editável em
-- /fiscal/configuracoes. fiscal_config não tem RLS liberada: só o servidor lê.
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS meudanfe_api_key TEXT;
