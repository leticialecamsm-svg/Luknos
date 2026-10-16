-- Nome dado à mão na conversa: o nome do perfil do WhatsApp não sobrescreve mais.
-- Aplicada em produção via MCP (crm_name_locked).
alter table public.crm_conversations add column if not exists name_locked boolean not null default false;
