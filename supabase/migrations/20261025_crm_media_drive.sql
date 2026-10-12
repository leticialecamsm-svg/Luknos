-- Arquivos do CRM no Google Drive, baixados só quando alguém pede.
-- O webhook deixa de baixar mídia automaticamente (exceto figurinhas): guarda só os dados
-- (nome, tipo, tamanho, miniatura). Ao clicar em "Baixar", o arquivo vai para o Drive.
alter table public.crm_messages
  add column if not exists drive_file_id text,
  add column if not exists media_size bigint,
  add column if not exists media_seconds int,
  add column if not exists thumb text;

-- Um arquivo igual (mesmo conteúdo) é guardado uma vez só, mesmo chegando em vários números.
create table if not exists public.crm_media_blobs (
  sha256 text primary key,
  drive_file_id text not null,
  web_view_link text,
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);
alter table public.crm_media_blobs enable row level security;
revoke all on public.crm_media_blobs from anon, authenticated;

create index if not exists crm_messages_offload_idx on public.crm_messages (created_at)
  where storage_path is not null and drive_file_id is null;

insert into public.internal_cron_secrets (name, secret)
values ('crm-offload', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
