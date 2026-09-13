-- Fase 1 do redesign "Viver de IA": tabelas de suporte ao tema (themes,
-- design_tokens, component_specs, screen_registry, redesign_progress,
-- feature_flags). Nao toca nenhuma tabela de negocio existente.
--
-- Fix sobre o pacote original: as policies do db/schemas.sql do pacote usam
-- (auth.jwt() ->> 'role') = 'admin', mas o Luknos nao popula esse claim no
-- JWT - o papel admin vive em public.users.role. Substituido por
-- is_redesign_admin(), no mesmo padrao de auth_role()/is_gestor() usado no
-- financeiro-ia, para reaproveitar o Auth existente em vez de criar um
-- mecanismo paralelo que nunca autorizaria ninguem.

create or replace function public.is_redesign_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin' and u.active = true
  );
$$;

revoke execute on function public.is_redesign_admin() from public;
grant execute on function public.is_redesign_admin() to authenticated;

create table themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_active boolean not null default false,
  version text not null default '1.0.0',
  primary_color text not null default '#111827',
  accent_color text not null default '#cba455',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_themes_is_active on themes (is_active);

create trigger trg_themes_updated_at
before update on themes
for each row execute function set_updated_at();

alter table themes enable row level security;

create policy themes_select on themes for select to authenticated using (true);
create policy themes_insert on themes for insert to authenticated with check (public.is_redesign_admin());
create policy themes_update on themes for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy themes_delete on themes for delete to authenticated using (public.is_redesign_admin());

create table design_tokens (
  id uuid primary key default gen_random_uuid(),
  token_key text not null,
  token_category text not null,
  token_value text not null,
  theme_id uuid not null references themes (id) on delete cascade,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_id, token_key)
);

create index idx_design_tokens_theme_id on design_tokens (theme_id);
create index idx_design_tokens_category on design_tokens (token_category);

create trigger trg_design_tokens_updated_at
before update on design_tokens
for each row execute function set_updated_at();

alter table design_tokens enable row level security;

create policy design_tokens_select on design_tokens for select to authenticated using (true);
create policy design_tokens_insert on design_tokens for insert to authenticated with check (public.is_redesign_admin());
create policy design_tokens_update on design_tokens for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy design_tokens_delete on design_tokens for delete to authenticated using (public.is_redesign_admin());

create table component_specs (
  id uuid primary key default gen_random_uuid(),
  component_key text not null,
  component_group text not null,
  spec_json jsonb not null default '{}',
  theme_id uuid not null references themes (id) on delete cascade,
  is_external_embed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_id, component_key)
);

create index idx_component_specs_theme_id on component_specs (theme_id);
create index idx_component_specs_group on component_specs (component_group);

create trigger trg_component_specs_updated_at
before update on component_specs
for each row execute function set_updated_at();

alter table component_specs enable row level security;

create policy component_specs_select on component_specs for select to authenticated using (true);
create policy component_specs_insert on component_specs for insert to authenticated with check (public.is_redesign_admin());
create policy component_specs_update on component_specs for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy component_specs_delete on component_specs for delete to authenticated using (public.is_redesign_admin());

create table screen_registry (
  id uuid primary key default gen_random_uuid(),
  screen_slug text not null unique,
  module_name text not null,
  route_path text not null,
  has_external_embed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_screen_registry_module on screen_registry (module_name);

create trigger trg_screen_registry_updated_at
before update on screen_registry
for each row execute function set_updated_at();

alter table screen_registry enable row level security;

create policy screen_registry_select on screen_registry for select to authenticated using (true);
create policy screen_registry_insert on screen_registry for insert to authenticated with check (public.is_redesign_admin());
create policy screen_registry_update on screen_registry for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy screen_registry_delete on screen_registry for delete to authenticated using (public.is_redesign_admin());

create table redesign_progress (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references screen_registry (id) on delete cascade,
  theme_id uuid not null references themes (id) on delete cascade,
  status text not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (screen_id, theme_id)
);

create index idx_redesign_progress_screen_id on redesign_progress (screen_id);
create index idx_redesign_progress_theme_id on redesign_progress (theme_id);
create index idx_redesign_progress_status on redesign_progress (status);

create trigger trg_redesign_progress_updated_at
before update on redesign_progress
for each row execute function set_updated_at();

alter table redesign_progress enable row level security;

create policy redesign_progress_select on redesign_progress for select to authenticated using (true);
create policy redesign_progress_insert on redesign_progress for insert to authenticated with check (public.is_redesign_admin());
create policy redesign_progress_update on redesign_progress for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy redesign_progress_delete on redesign_progress for delete to authenticated using (public.is_redesign_admin());

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null unique,
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_feature_flags_enabled on feature_flags (is_enabled);

create trigger trg_feature_flags_updated_at
before update on feature_flags
for each row execute function set_updated_at();

alter table feature_flags enable row level security;

create policy feature_flags_select on feature_flags for select to authenticated using (true);
create policy feature_flags_insert on feature_flags for insert to authenticated with check (public.is_redesign_admin());
create policy feature_flags_update on feature_flags for update to authenticated using (public.is_redesign_admin()) with check (public.is_redesign_admin());
create policy feature_flags_delete on feature_flags for delete to authenticated using (public.is_redesign_admin());
