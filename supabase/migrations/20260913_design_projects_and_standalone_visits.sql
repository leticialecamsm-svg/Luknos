-- Visitas e Projetos passam a poder existir sem um orcamento ainda aberto
-- (pedido da gestora: "Solicitacao" pode nascer como Visita ou Projeto e
-- evoluir pra Orcamento/Negociacao/Expedicao depois -- tudo separado, mas
-- linkado por FK, nao um card unico atravessando os setores).

alter table visits alter column quote_id drop not null;
alter table visits add column if not exists client_id uuid references contacts(id);
alter table visits add column if not exists architect_id uuid references contacts(id);
alter table visits add column if not exists title text;
alter table visits add column if not exists scheduled_time text;
alter table visits add column if not exists created_by uuid references users(id);

create sequence if not exists design_projects_number_seq;

do $$ begin
  create type design_project_status as enum ('fila', 'em_andamento', 'concluido');
exception when duplicate_object then null;
end $$;

create table if not exists design_projects (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('design_projects_number_seq'),
  client_id uuid not null references contacts(id),
  architect_id uuid references contacts(id),
  title text not null,
  description text,
  status design_project_status not null default 'fila',
  visit_id uuid references visits(id),
  quote_id uuid references quotes(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_design_projects_client on design_projects (client_id);
create index if not exists idx_design_projects_status on design_projects (status);
create index if not exists idx_design_projects_quote on design_projects (quote_id);
create index if not exists idx_design_projects_visit on design_projects (visit_id);

create trigger trg_design_projects_updated_at
before update on design_projects
for each row execute function set_updated_at();

alter table design_projects enable row level security;

-- Mesmo padrao de quotes_all_auth: controle de acesso fino fica na
-- camada de app (getMyProjects/getAllProjects), nao na RLS.
create policy design_projects_all_auth on design_projects
for all to authenticated using (true) with check (true);

alter table visits add column if not exists design_project_id uuid references design_projects(id);
create index if not exists idx_visits_client on visits (client_id);
create index if not exists idx_visits_design_project on visits (design_project_id);

-- Visitas agora podem existir sem quote_id (solicitacao direta) -- as
-- policies antigas dependiam de is_quote_owner(quote_id), que quebra com
-- quote_id nulo. Substitui por uma checagem que cobre os dois casos.
drop policy if exists "Dono ou admin vê visita" on visits;
drop policy if exists "Dono ou admin atualiza visita" on visits;

create policy "Dono ou admin vê visita" on visits
for select to authenticated
using (is_admin() or (quote_id is not null and is_quote_owner(quote_id)) or created_by = auth.uid());

create policy "Dono ou admin atualiza visita" on visits
for update to authenticated
using (is_admin() or (quote_id is not null and is_quote_owner(quote_id)) or created_by = auth.uid());
