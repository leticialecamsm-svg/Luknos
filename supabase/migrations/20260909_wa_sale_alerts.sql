-- Aviso de "venda fechada" via robô WhatsApp: telefones (expedição / Gabriel) e
-- JID do grupo da loja para a mensagem de comemoração. Disparado por closeSale().
alter table public.wa_bot_config add column if not exists sale_alert_phones text[] not null default '{}';
alter table public.wa_bot_config add column if not exists store_group_jid text;
comment on column public.wa_bot_config.sale_alert_phones is 'Telefones E.164 que recebem o aviso de "venda fechada".';
comment on column public.wa_bot_config.store_group_jid is 'JID do grupo da loja (xxxxx@g.us) p/ a comemoração de venda fechada. Null = não envia no grupo.';

-- Gabriel (expedição)
update public.wa_bot_config
set sale_alert_phones = array['+5582988634554']
where sale_alert_phones = '{}'::text[];
