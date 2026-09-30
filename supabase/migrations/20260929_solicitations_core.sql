-- Lote 1 da feature "Solicitações": tabela de identidade fina (cordão leve)
-- + solicitation_id nas tabelas existentes, sem tocar em nada que já existe.
--
-- Por que uma tabela "solicitations" e não um card único por venda: uma
-- Solicitação pode passar por até 10 etapas (Visita, Projeto, Orçamento,
-- Negociação, Venda fechada/perdida, Compra de material, Separação de
-- material/Expedição, Entrega, Acompanhamento de instalação, Pós-venda) de
-- forma não linear e às vezes simultânea — o mesmo padrão documentado em
-- 20260913_design_projects_and_standalone_visits.sql e no topo de
-- design-projects-actions.ts (uma venda fechada pode estar em Projetos e em
-- Expedição ao mesmo tempo). Em vez de forçar tudo numa linha só, mantemos
-- os registros SEPARADOS em suas tabelas de sempre e apenas os linkamos por
-- FK a uma "solicitations" comum. Isso é 100% aditivo: nenhuma tabela,
-- coluna, view ou comportamento existente é alterado ou removido.
--
-- Sem RLS/policies aqui — mesmo padrão de policies/actions.ts e
-- training_*/policy_* tables: controle de acesso fica 100% na camada de
-- app (server actions com admin client), nunca em policy SQL.

-- ── Identidade da Solicitação ───────────────────────────────────────────

create sequence if not exists solicitations_number_seq;

create table if not exists solicitations (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('solicitations_number_seq'),
  client_id uuid not null references contacts(id),
  architect_id uuid references contacts(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_solicitations_client on solicitations (client_id);
create index if not exists idx_solicitations_architect on solicitations (architect_id);
create unique index if not exists idx_solicitations_number on solicitations (number);

-- ── solicitation_id nas tabelas existentes (nullable, aditivo) ──────────
-- Nullable porque registros antigos não têm Solicitação ainda (o backfill
-- da migration seguinte cuida disso) e porque nem toda etapa precisa
-- necessariamente estar amarrada a uma Solicitação para continuar
-- funcionando exatamente como hoje.

alter table quotes add column if not exists solicitation_id uuid references solicitations(id);
create index if not exists idx_quotes_solicitation on quotes (solicitation_id);

alter table negotiations add column if not exists solicitation_id uuid references solicitations(id);
create index if not exists idx_negotiations_solicitation on negotiations (solicitation_id);

alter table shipments add column if not exists solicitation_id uuid references solicitations(id);
create index if not exists idx_shipments_solicitation on shipments (solicitation_id);

alter table visits add column if not exists solicitation_id uuid references solicitations(id);
create index if not exists idx_visits_solicitation on visits (solicitation_id);

alter table design_projects add column if not exists solicitation_id uuid references solicitations(id);
create index if not exists idx_design_projects_solicitation on design_projects (solicitation_id);

-- ── design_projects.kind ────────────────────────────────────────────────
-- Distingue projeto de "elaboração" (o luminotécnico normal) de "alocação
-- de pontos" (planta de pontos de luz para expedição/instalação), pedido
-- pela gestora para o wireframe de Solicitações. Default preserva o
-- comportamento atual de todo projeto já existente.

alter table design_projects add column if not exists kind text not null default 'elaboracao';

do $$ begin
  alter table design_projects add constraint design_projects_kind_check
    check (kind in ('elaboracao', 'alocacao_pontos'));
exception when duplicate_object then null;
end $$;

-- ── Campos de entrega em shipments (etapa "Entrega" do wireframe) ───────

alter table shipments add column if not exists received_by text;
alter table shipments add column if not exists received_at timestamptz;
alter table shipments add column if not exists delivery_photo_url text;

-- ── Compra de material ───────────────────────────────────────────────────

create table if not exists purchase_checklist_items (
  id uuid primary key default gen_random_uuid(),
  solicitation_id uuid not null references solicitations(id),
  description text not null,
  supplier text,
  status text not null default 'a_pedir' check (status in ('a_pedir', 'pedido', 'recebido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists idx_purchase_checklist_items_solicitation on purchase_checklist_items (solicitation_id);

create trigger trg_purchase_checklist_items_updated_at
before update on purchase_checklist_items
for each row execute function set_updated_at();

-- ── Acompanhamento de instalação ─────────────────────────────────────────

create table if not exists installation_trackings (
  id uuid primary key default gen_random_uuid(),
  solicitation_id uuid not null references solicitations(id),
  scheduled_date date,
  team text,
  status text not null default 'agendada' check (status in ('agendada', 'em_andamento', 'concluida', 'com_pendencia')),
  photos jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists idx_installation_trackings_solicitation on installation_trackings (solicitation_id);

create trigger trg_installation_trackings_updated_at
before update on installation_trackings
for each row execute function set_updated_at();

-- ── Pós-venda ─────────────────────────────────────────────────────────────

create table if not exists post_sale_followups (
  id uuid primary key default gen_random_uuid(),
  solicitation_id uuid not null references solicitations(id),
  contacted_at timestamptz,
  satisfaction text,
  issue_reported text,
  resolution text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists idx_post_sale_followups_solicitation on post_sale_followups (solicitation_id);

-- ── RLS (sem policy) — mesmo padrão de training_*/policy_* ───────────────
-- Bloqueia por padrão qualquer acesso via API pública (PostgREST
-- anon/authenticated); todo acesso real passa pelo admin client do
-- servidor nas server actions, igual o resto do sistema.
alter table solicitations enable row level security;
alter table purchase_checklist_items enable row level security;
alter table installation_trackings enable row level security;
alter table post_sale_followups enable row level security;
