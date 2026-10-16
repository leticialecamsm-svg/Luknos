-- Vínculos de uma etapa da Solicitação com contatos e conversas do CRM.
-- ref_id aponta para contacts.id (kind='contact') ou crm_conversations.id
-- (kind='conversation'); a visibilidade da conversa continua sendo a do CRM (RLS).
create table if not exists solicitation_stage_links (
  id uuid primary key default uuid_generate_v4(),
  solicitation_id uuid not null references solicitations(id) on delete cascade,
  stage text not null,
  kind text not null check (kind in ('contact','conversation')),
  ref_id uuid not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (solicitation_id, stage, kind, ref_id)
);
create index if not exists idx_ssl_solicitation on solicitation_stage_links (solicitation_id);
