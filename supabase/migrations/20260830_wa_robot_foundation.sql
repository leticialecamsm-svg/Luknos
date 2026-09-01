-- ============================================================================
-- Robô de Orçamentos WhatsApp — Fase 1 (Fundação)
-- Módulo isolado: todas as tabelas usam prefixo wa_. Não toca em tabelas de
-- negócio (quotes, contacts, proposals, users). A gravação de orçamento é feita
-- exclusivamente via POST /api/external/quotes (fora desta migração).
--
-- RLS adaptada ao padrão do Luknos: o papel vem de public.users.role
-- (não há custom claim `role` no JWT). As Edge Functions usam a service role,
-- que ignora RLS — por isso as políticas de escrita para o frontend são `false`.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers de papel (isolados do módulo, prefixo wa_)
-- ---------------------------------------------------------------------------
create or replace function public.wa_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- "staff" = qualquer usuário interno autenticado do Luknos (equipe).
create or replace function public.wa_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and coalesce(u.active, true)
  );
$$;

create or replace function public.wa_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.wa_is_admin() from anon;
revoke execute on function public.wa_is_staff() from anon;

-- ---------------------------------------------------------------------------
-- wa_bot_config
-- ---------------------------------------------------------------------------
create table if not exists public.wa_bot_config (
  id uuid primary key default gen_random_uuid(),
  evolution_instance_name text not null,
  system_api_base_url text not null,
  system_api_key_secret_ref text not null,
  default_priority text not null default 'Média',
  allowed_origins text[] not null default '{Visita,WhatsApp,Loja,Indicação,Outro}',
  allowed_categories text[] not null default '{Iluminação,Automação,"Iluminação + Automação"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_wa_bot_config_updated_at on public.wa_bot_config;
create trigger trg_wa_bot_config_updated_at
before update on public.wa_bot_config
for each row execute function public.wa_set_updated_at();

alter table public.wa_bot_config enable row level security;

drop policy if exists wa_bot_config_select on public.wa_bot_config;
create policy wa_bot_config_select on public.wa_bot_config
for select to authenticated using (public.wa_is_admin());

drop policy if exists wa_bot_config_insert on public.wa_bot_config;
create policy wa_bot_config_insert on public.wa_bot_config
for insert to authenticated with check (public.wa_is_admin());

drop policy if exists wa_bot_config_update on public.wa_bot_config;
create policy wa_bot_config_update on public.wa_bot_config
for update to authenticated using (public.wa_is_admin()) with check (public.wa_is_admin());

drop policy if exists wa_bot_config_delete on public.wa_bot_config;
create policy wa_bot_config_delete on public.wa_bot_config
for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- wa_collaborators (whitelist)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_collaborators (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  display_name text not null,
  system_user_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_collaborators_phone on public.wa_collaborators (phone_e164);
create index if not exists idx_wa_collaborators_active on public.wa_collaborators (is_active);

drop trigger if exists trg_wa_collaborators_updated_at on public.wa_collaborators;
create trigger trg_wa_collaborators_updated_at
before update on public.wa_collaborators
for each row execute function public.wa_set_updated_at();

alter table public.wa_collaborators enable row level security;

drop policy if exists wa_collaborators_select on public.wa_collaborators;
create policy wa_collaborators_select on public.wa_collaborators
for select to authenticated using (public.wa_is_staff());

drop policy if exists wa_collaborators_insert on public.wa_collaborators;
create policy wa_collaborators_insert on public.wa_collaborators
for insert to authenticated with check (public.wa_is_admin());

drop policy if exists wa_collaborators_update on public.wa_collaborators;
create policy wa_collaborators_update on public.wa_collaborators
for update to authenticated using (public.wa_is_admin()) with check (public.wa_is_admin());

drop policy if exists wa_collaborators_delete on public.wa_collaborators;
create policy wa_collaborators_delete on public.wa_collaborators
for delete to authenticated using (public.wa_is_admin());

-- ---------------------------------------------------------------------------
-- wa_conversations (máquina de estados do cadastro guiado)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.wa_collaborators (id) on delete restrict,
  remote_jid text not null,
  status text not null default 'collecting',
  current_field text,
  collected_data jsonb not null default '{}',
  system_quote_id text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_conversations_collaborator on public.wa_conversations (collaborator_id);
create index if not exists idx_wa_conversations_status on public.wa_conversations (status);
create index if not exists idx_wa_conversations_last_message on public.wa_conversations (last_message_at);
create index if not exists idx_wa_conversations_active on public.wa_conversations (collaborator_id)
  where status in ('collecting','awaiting_confirmation');

drop trigger if exists trg_wa_conversations_updated_at on public.wa_conversations;
create trigger trg_wa_conversations_updated_at
before update on public.wa_conversations
for each row execute function public.wa_set_updated_at();

alter table public.wa_conversations enable row level security;

drop policy if exists wa_conversations_select on public.wa_conversations;
create policy wa_conversations_select on public.wa_conversations
for select to authenticated using (public.wa_is_staff());

drop policy if exists wa_conversations_insert on public.wa_conversations;
create policy wa_conversations_insert on public.wa_conversations
for insert to authenticated with check (false);

drop policy if exists wa_conversations_update on public.wa_conversations;
create policy wa_conversations_update on public.wa_conversations
for update to authenticated using (false) with check (false);

drop policy if exists wa_conversations_delete on public.wa_conversations;
create policy wa_conversations_delete on public.wa_conversations
for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- wa_messages (log append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  direction text not null,
  message_type text not null,
  body text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_messages_conversation on public.wa_messages (conversation_id, created_at);
create unique index if not exists idx_wa_messages_provider on public.wa_messages (provider_message_id)
  where provider_message_id is not null;

drop trigger if exists trg_wa_messages_updated_at on public.wa_messages;
create trigger trg_wa_messages_updated_at
before update on public.wa_messages
for each row execute function public.wa_set_updated_at();

alter table public.wa_messages enable row level security;

drop policy if exists wa_messages_select on public.wa_messages;
create policy wa_messages_select on public.wa_messages
for select to authenticated using (public.wa_is_staff());

drop policy if exists wa_messages_insert on public.wa_messages;
create policy wa_messages_insert on public.wa_messages
for insert to authenticated with check (false);

drop policy if exists wa_messages_update on public.wa_messages;
create policy wa_messages_update on public.wa_messages
for update to authenticated using (false) with check (false);

drop policy if exists wa_messages_delete on public.wa_messages;
create policy wa_messages_delete on public.wa_messages
for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- wa_attachments
-- ---------------------------------------------------------------------------
create table if not exists public.wa_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  detected_kind text,
  size_bytes bigint,
  system_quote_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_attachments_conversation on public.wa_attachments (conversation_id);
create index if not exists idx_wa_attachments_quote on public.wa_attachments (system_quote_id);

drop trigger if exists trg_wa_attachments_updated_at on public.wa_attachments;
create trigger trg_wa_attachments_updated_at
before update on public.wa_attachments
for each row execute function public.wa_set_updated_at();

alter table public.wa_attachments enable row level security;

drop policy if exists wa_attachments_select on public.wa_attachments;
create policy wa_attachments_select on public.wa_attachments
for select to authenticated using (public.wa_is_staff());

drop policy if exists wa_attachments_insert on public.wa_attachments;
create policy wa_attachments_insert on public.wa_attachments
for insert to authenticated with check (false);

drop policy if exists wa_attachments_update on public.wa_attachments;
create policy wa_attachments_update on public.wa_attachments
for update to authenticated using (false) with check (false);

drop policy if exists wa_attachments_delete on public.wa_attachments;
create policy wa_attachments_delete on public.wa_attachments
for delete to authenticated using (public.wa_is_admin());

-- ---------------------------------------------------------------------------
-- wa_submission_log
-- ---------------------------------------------------------------------------
create table if not exists public.wa_submission_log (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  request_payload jsonb not null,
  response_status int,
  response_body jsonb,
  success boolean not null default false,
  error_message text,
  attempt_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_submission_log_conversation on public.wa_submission_log (conversation_id);
create index if not exists idx_wa_submission_log_success on public.wa_submission_log (success, created_at);

drop trigger if exists trg_wa_submission_log_updated_at on public.wa_submission_log;
create trigger trg_wa_submission_log_updated_at
before update on public.wa_submission_log
for each row execute function public.wa_set_updated_at();

alter table public.wa_submission_log enable row level security;

drop policy if exists wa_submission_log_select on public.wa_submission_log;
create policy wa_submission_log_select on public.wa_submission_log
for select to authenticated using (public.wa_is_admin());

drop policy if exists wa_submission_log_insert on public.wa_submission_log;
create policy wa_submission_log_insert on public.wa_submission_log
for insert to authenticated with check (false);

drop policy if exists wa_submission_log_update on public.wa_submission_log;
create policy wa_submission_log_update on public.wa_submission_log
for update to authenticated using (false) with check (false);

drop policy if exists wa_submission_log_delete on public.wa_submission_log;
create policy wa_submission_log_delete on public.wa_submission_log
for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- wa_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.wa_notifications (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  target_phone_e164 text not null,
  system_quote_id text not null,
  channel text not null default 'whatsapp',
  status text not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_notifications_status on public.wa_notifications (status);
create index if not exists idx_wa_notifications_conversation on public.wa_notifications (conversation_id);

drop trigger if exists trg_wa_notifications_updated_at on public.wa_notifications;
create trigger trg_wa_notifications_updated_at
before update on public.wa_notifications
for each row execute function public.wa_set_updated_at();

alter table public.wa_notifications enable row level security;

drop policy if exists wa_notifications_select on public.wa_notifications;
create policy wa_notifications_select on public.wa_notifications
for select to authenticated using (public.wa_is_staff());

drop policy if exists wa_notifications_insert on public.wa_notifications;
create policy wa_notifications_insert on public.wa_notifications
for insert to authenticated with check (false);

drop policy if exists wa_notifications_update on public.wa_notifications;
create policy wa_notifications_update on public.wa_notifications
for update to authenticated using (false) with check (false);

drop policy if exists wa_notifications_delete on public.wa_notifications;
create policy wa_notifications_delete on public.wa_notifications
for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Storage: bucket privado wa-attachments
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('wa-attachments', 'wa-attachments', false)
on conflict (id) do nothing;

drop policy if exists wa_attachments_storage_read on storage.objects;
create policy wa_attachments_storage_read on storage.objects
for select to authenticated
using (bucket_id = 'wa-attachments' and public.wa_is_staff());

-- Escrita/remoção no bucket ficam a cargo da service role (Edge Functions),
-- que ignora RLS. Nenhuma policy de insert/update/delete para o frontend.

-- ---------------------------------------------------------------------------
-- Defense-in-depth: remove os GRANTs default do Supabase para o papel `anon`.
-- RLS já nega tudo (nenhuma policy mira `anon`); isto torna o bloqueio
-- explícito mesmo se RLS for desabilitado ou uma policy permissiva entrar.
-- ---------------------------------------------------------------------------
revoke all on public.wa_bot_config     from anon;
revoke all on public.wa_collaborators  from anon;
revoke all on public.wa_conversations  from anon;
revoke all on public.wa_messages       from anon;
revoke all on public.wa_attachments    from anon;
revoke all on public.wa_submission_log from anon;
revoke all on public.wa_notifications  from anon;
