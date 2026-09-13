-- Fase 3: nenhum modulo do Luknos usa iframe/widget/mapa externo de fato
-- (verificado no codigo) -- os graficos sao componentes React nativos, nao
-- embeds. Corrige o has_external_embed=true que o seed da Fase 1 marcou por
-- suposicao errada em finance/financeiro-ia/bot-whatsapp/reports.
update screen_registry set has_external_embed = false where has_external_embed = true;
