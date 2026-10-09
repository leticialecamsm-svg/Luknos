-- Biblioteca de figurinhas da equipe (arquivos .webp no bucket crm-attachments).
-- Aplicada em produção via MCP (crm_stickers).
create table if not exists public.crm_stickers (
  id uuid primary key default gen_random_uuid(),
  name text,
  storage_path text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.crm_stickers enable row level security;
revoke all on public.crm_stickers from anon, authenticated;
