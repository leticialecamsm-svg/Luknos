-- Responsáveis por etapa de uma Solicitação.
-- Pedido Letícia: cada etapa (visita/projeto/orcamento/compra/expedicao/
-- instalacao/posVenda) pode ter 1 ou mais colaboradores atribuídos como
-- responsáveis — diferente de "equipe envolvida" (quem já registrou ações),
-- aqui é designação explícita.

create table if not exists solicitation_stage_responsibles (
  id uuid primary key default uuid_generate_v4(),
  solicitation_id uuid not null references solicitations(id) on delete cascade,
  stage text not null,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  unique (solicitation_id, stage, user_id)
);

create index if not exists idx_ssr_solicitation on solicitation_stage_responsibles (solicitation_id);
create index if not exists idx_ssr_user on solicitation_stage_responsibles (user_id);
