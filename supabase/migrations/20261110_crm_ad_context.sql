-- Conversa iniciada por anúncio (Click-to-WhatsApp: Facebook, Instagram, Status): dados do anúncio
-- que o WhatsApp manda na primeira mensagem, para mostrar o cartão como no WhatsApp Web.
alter table public.crm_messages add column if not exists ad_context jsonb;

insert into public.crm_labels (name, color)
select 'Tráfego pago', '#f97316'
where not exists (select 1 from public.crm_labels where name = 'Tráfego pago');
