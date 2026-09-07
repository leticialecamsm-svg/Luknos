-- ============================================================================
-- Leitura de Projeto Luminotécnico — V1 (Fundação)
-- Módulo isolado: todas as tabelas usam prefixo plan_/project_. Não toca em
-- tabelas de negócio (quotes, contacts, tasks). Nesta V1 não há nenhuma
-- ligação obrigatória com orçamento — `quote_id` fica nullable, só pra não
-- travar a integração futura (ver documento da feature, seção 18).
--
-- RLS: reaproveita public.wa_is_staff()/wa_is_admin() (já existentes, do
-- módulo do robô de WhatsApp) em vez de duplicar os mesmos helpers de papel.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Plantas (o PDF em si)
-- ---------------------------------------------------------------------------
create table public.project_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  original_filename text,
  storage_path text not null,
  num_pages int not null default 1,
  -- Escala por página: { "1": metros_por_pixel_na_resolução_base_de_render }.
  -- Preenchida pela calibração manual (dois pontos + distância real).
  scale_m_per_px jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  -- Nullable de propósito — nesta V1 a página existe solta, sem orçamento.
  quote_id uuid references public.quotes(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ambientes (polígono desenhado sobre a página)
-- ---------------------------------------------------------------------------
create table public.plan_environments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  page int not null default 1,
  name text not null,
  -- [[x,y], [x,y], ...] em coordenadas da página (espaço de render base do PDF)
  polygon jsonb not null,
  origin text not null default 'manual' check (origin in ('automatica', 'manual')),
  status text not null default 'confirmado' check (status in ('sugerido', 'confirmado', 'editado')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Legenda do projeto (código → especificação original, editável)
-- ---------------------------------------------------------------------------
create table public.plan_legend_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  code text not null,               -- L1, L2, F1 (fita), P1 (perfil)...
  description text,
  power_w numeric,
  color_temp_k int,
  lumen_flux numeric,
  finish text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ocorrências de símbolo (um ponto marcado na planta = uma luminária)
-- ---------------------------------------------------------------------------
create table public.plan_symbol_occurrences (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  legend_item_id uuid references public.plan_legend_items(id) on delete set null,
  environment_id uuid references public.plan_environments(id) on delete set null,
  page int not null default 1,
  x numeric not null,
  y numeric not null,
  confidence numeric,               -- null = marcação manual, sem "confiança" de detecção
  detection_source text not null default 'manual' check (detection_source in ('manual', 'automatica')),
  status text not null default 'confirmado' check (status in ('sugerido', 'confirmado', 'falso_positivo')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Medições (trechos de perfil ou fita de LED)
-- ---------------------------------------------------------------------------
create table public.plan_measurements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  environment_id uuid references public.plan_environments(id) on delete set null,
  page int not null default 1,
  kind text not null check (kind in ('perfil', 'fita')),
  label text,
  points jsonb not null,            -- [[x,y], [x,y], ...] — 2 pontos ou polilinha
  length_m numeric not null,
  power_w_per_m numeric,            -- só usado quando kind = 'fita', editável pelo consultor
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Anotações do editor de PDF (camada separada — nunca altera o PDF original)
-- ---------------------------------------------------------------------------
create table public.plan_annotations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  page int not null default 1,
  kind text not null check (kind in ('freehand', 'rect', 'highlight', 'text')),
  data jsonb not null,              -- payload específico do tipo (pontos, texto, cor...)
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Log de auditoria — todo valor automático substituído por edição manual
-- ---------------------------------------------------------------------------
create table public.plan_edit_log (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  entity_type text not null,        -- environment | legend_item | symbol_occurrence | measurement
  entity_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index on public.plan_environments (plan_id);
create index on public.plan_legend_items (plan_id);
create index on public.plan_symbol_occurrences (plan_id);
create index on public.plan_symbol_occurrences (environment_id);
create index on public.plan_measurements (plan_id);
create index on public.plan_measurements (environment_id);
create index on public.plan_annotations (plan_id);
create index on public.plan_edit_log (plan_id);

-- ---------------------------------------------------------------------------
-- RLS — qualquer colaborador ativo (staff) lê e escreve; sem papel específico
-- de "consultor" no schema atual, então segue o mesmo padrão usado em outras
-- áreas internas do sistema (tarefas, agenda etc).
-- ---------------------------------------------------------------------------
alter table public.project_plans          enable row level security;
alter table public.plan_environments      enable row level security;
alter table public.plan_legend_items      enable row level security;
alter table public.plan_symbol_occurrences enable row level security;
alter table public.plan_measurements      enable row level security;
alter table public.plan_annotations       enable row level security;
alter table public.plan_edit_log          enable row level security;

create policy "staff_all_project_plans" on public.project_plans
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_all_plan_environments" on public.plan_environments
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_all_plan_legend_items" on public.plan_legend_items
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_all_plan_symbol_occurrences" on public.plan_symbol_occurrences
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_all_plan_measurements" on public.plan_measurements
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_all_plan_annotations" on public.plan_annotations
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
create policy "staff_read_plan_edit_log" on public.plan_edit_log
  for select using (public.wa_is_staff());
create policy "staff_insert_plan_edit_log" on public.plan_edit_log
  for insert with check (public.wa_is_staff());

-- ---------------------------------------------------------------------------
-- Storage: bucket público (mesmo padrão de `shipments`) pros PDFs originais.
-- Fica atrás de autenticação na aplicação (a página exige login), então o
-- "público" aqui é só o mesmo nível de exposição que já existe hoje pra
-- arquivos de expedição.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project-plans', 'project-plans', true)
on conflict (id) do nothing;
