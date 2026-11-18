-- Biblioteca de blocos CAD da Luknos (reutilizada em qualquer desenho aberto no laboratório CAD).
-- Acesso só pelas server actions (cliente admin); RLS ligada, sem políticas.
create table if not exists public.cad_block_library (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  data jsonb not null,
  seg_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cad_block_library enable row level security;
