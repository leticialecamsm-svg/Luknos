-- A mesma mensagem do WhatsApp chega por vários números nossos (grupo com 2+ números, ou conversa entre
-- dois números nossos) com o MESMO id. A deduplicação precisa ser por conversa, não global.
drop index if exists public.idx_crm_messages_provider;
create unique index if not exists idx_crm_messages_provider_conv
  on public.crm_messages (conversation_id, provider_message_id)
  where provider_message_id is not null;
