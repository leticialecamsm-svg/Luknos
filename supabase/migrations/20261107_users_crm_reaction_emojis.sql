-- 6 emojis de reação favoritos de cada atendente no CRM (nulo = padrão do WhatsApp).
alter table public.users add column if not exists crm_reaction_emojis text[];
