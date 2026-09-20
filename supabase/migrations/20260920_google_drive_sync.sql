-- Integração Google Drive: token de acesso (1 linha) + colunas de sincronização dos anexos do robô.
create table if not exists public.google_drive_connection (
  id boolean primary key default true check (id),
  refresh_token text not null,
  account_email text,
  connected_at timestamptz not null default now(),
  connected_by uuid
);
alter table public.google_drive_connection enable row level security;
-- sem policies: só o service role (admin client) lê/escreve.

alter table public.wa_attachments
  add column if not exists drive_file_id text,
  add column if not exists drive_web_link text,
  add column if not exists drive_synced_at timestamptz,
  add column if not exists drive_error text,
  add column if not exists storage_deleted_at timestamptz;
