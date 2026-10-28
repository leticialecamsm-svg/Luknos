-- Assinar ou não as mensagens enviadas pelo CRM (preferência de quem digita).
alter table public.users add column if not exists crm_signature boolean not null default true;
-- João (admin) responde sem assinatura por padrão
update public.users set crm_signature = false where id = '2068a35c-f77f-4405-ae95-b39272d2a957';

-- Se a mensagem enviada levou a assinatura "*Nome:*" (nulo = mensagens antigas).
alter table public.crm_messages add column if not exists signed boolean;
