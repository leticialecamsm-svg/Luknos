-- Conversa do CRM (individual ou grupo) de onde a solicitação foi criada.
-- Alimenta o botão "abrir conversa" da solicitação, inclusive para grupos
-- (que não têm contato vinculado).
alter table solicitations
  add column if not exists crm_conversation_id uuid references crm_conversations(id) on delete set null;
