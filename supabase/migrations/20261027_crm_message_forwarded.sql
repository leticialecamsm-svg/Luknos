-- Mensagens encaminhadas (selo "Encaminhada", como no WhatsApp): detectado no recebimento
-- (contextInfo.isForwarded) e marcado quando nós encaminhamos.
alter table public.crm_messages add column if not exists is_forwarded boolean not null default false;
