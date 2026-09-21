alter table public.quote_attachments
  add column if not exists drive_file_id text,
  add column if not exists drive_web_link text,
  add column if not exists drive_synced_at timestamptz,
  add column if not exists drive_error text,
  add column if not exists storage_deleted_at timestamptz;
