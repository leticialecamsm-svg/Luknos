-- Histórico da Solicitação: notas manuais dos colaboradores (kind = 'note') e
-- eventos automáticos gravados pelas server actions (kind = 'system').
-- Sem policies de propósito (mesmo padrão das demais tabelas da Solicitação):
-- RLS ligado e nenhum acesso direto; leitura/escrita só pelo admin client.

create table if not exists solicitation_events (
  id uuid primary key default gen_random_uuid(),
  solicitation_id uuid not null references solicitations(id) on delete cascade,
  stage text null,
  kind text not null default 'note' check (kind in ('note', 'system')),
  description text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_solicitation_events_solicitation
  on solicitation_events (solicitation_id, created_at desc);

alter table solicitation_events enable row level security;
