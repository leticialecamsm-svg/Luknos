-- Qual contato (cliente/especificador) representa cada grupo do WhatsApp nas
-- solicitações. Chave = jid do grupo (igual em todos os números da empresa).
-- Acesso só pelo service role.
create table if not exists crm_group_contacts (
  remote_jid text primary key,
  contact_id uuid not null references contacts(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table crm_group_contacts enable row level security;
revoke all on crm_group_contacts from anon, authenticated;
