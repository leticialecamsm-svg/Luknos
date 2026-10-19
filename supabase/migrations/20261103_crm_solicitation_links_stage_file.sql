-- Arquivo copiado para a subpasta da etapa no Drive ('pending' enquanto copia).
alter table public.crm_solicitation_links add column if not exists stage_drive_file_id text;
