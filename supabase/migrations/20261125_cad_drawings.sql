-- Laboratório CAD: desenhos salvos (arquivo original no Storage + alterações em JSON).
-- Acesso só pelas server actions (cliente admin); RLS ligada, sem políticas.
create table if not exists public.cad_drawings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  name text not null,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cad_drawings_owner_idx on public.cad_drawings (owner, updated_at desc);
alter table public.cad_drawings enable row level security;
insert into storage.buckets (id, name, public) values ('cad-drawings', 'cad-drawings', false) on conflict (id) do nothing;
