-- ============================================================================
-- CRM / Chat multiatendente WhatsApp — Fase 1 (fundação)
-- Módulo separado do robô de orçamentos (wa_*): o robô é um fluxo de cadastro
-- guiado (máquina de estados); isto aqui é chat livre entre vendedor e
-- cliente, em cima de vários números da Evolution (um por vendedor/loja).
-- Mesmas convenções do módulo wa_* (prefixo próprio, wa_is_admin/wa_is_staff,
-- escrita só via service role nas Edge Functions / admin client no server).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- crm_instances — um número (instância Evolution) por linha. O robô de
-- orçamentos continua em wa_bot_config; não migramos ele pra cá.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  phone_e164 text,
  label text not null,
  default_user_id uuid references public.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_crm_instances_updated_at on public.crm_instances;
create trigger trg_crm_instances_updated_at
before update on public.crm_instances
for each row execute function public.wa_set_updated_at();

alter table public.crm_instances enable row level security;

drop policy if exists crm_instances_select on public.crm_instances;
create policy crm_instances_select on public.crm_instances
for select to authenticated using (public.wa_is_staff());

drop policy if exists crm_instances_insert on public.crm_instances;
create policy crm_instances_insert on public.crm_instances
for insert to authenticated with check (public.wa_is_admin());

drop policy if exists crm_instances_update on public.crm_instances;
create policy crm_instances_update on public.crm_instances
for update to authenticated using (public.wa_is_admin()) with check (public.wa_is_admin());

drop policy if exists crm_instances_delete on public.crm_instances;
create policy crm_instances_delete on public.crm_instances
for delete to authenticated using (public.wa_is_admin());

-- ---------------------------------------------------------------------------
-- crm_conversations — 1 conversa por (instância, remote_jid). contact_id é
-- opcional (nem todo contato de WhatsApp vira um contato formal do sistema).
-- request_id fica reservado pro módulo de solicitações (FK adicionada depois,
-- quando aquela tabela existir — não criamos aqui pra não acoplar).
-- ---------------------------------------------------------------------------
create table if not exists public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.crm_instances (id) on delete restrict,
  remote_jid text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  contact_name_cache text,
  assigned_user_id uuid references public.users (id) on delete set null,
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_crm_conversations_instance_jid
  on public.crm_conversations (instance_id, remote_jid);
create index if not exists idx_crm_conversations_assigned on public.crm_conversations (assigned_user_id);
create index if not exists idx_crm_conversations_contact on public.crm_conversations (contact_id);
create index if not exists idx_crm_conversations_status on public.crm_conversations (status);
create index if not exists idx_crm_conversations_last_message on public.crm_conversations (last_message_at desc);

drop trigger if exists trg_crm_conversations_updated_at on public.crm_conversations;
create trigger trg_crm_conversations_updated_at
before update on public.crm_conversations
for each row execute function public.wa_set_updated_at();

alter table public.crm_conversations enable row level security;

drop policy if exists crm_conversations_select on public.crm_conversations;
create policy crm_conversations_select on public.crm_conversations
for select to authenticated using (public.wa_is_staff());

-- insert/update liberado pro staff autenticado (atribuir/transferir/vincular
-- contato acontece direto do painel, não só via service role).
drop policy if exists crm_conversations_insert on public.crm_conversations;
create policy crm_conversations_insert on public.crm_conversations
for insert to authenticated with check (public.wa_is_staff());

drop policy if exists crm_conversations_update on public.crm_conversations;
create policy crm_conversations_update on public.crm_conversations
for update to authenticated using (public.wa_is_staff()) with check (public.wa_is_staff());

drop policy if exists crm_conversations_delete on public.crm_conversations;
create policy crm_conversations_delete on public.crm_conversations
for delete to authenticated using (public.wa_is_admin());

-- ---------------------------------------------------------------------------
-- crm_messages — log append-only. sender_user_id null = mensagem do cliente
-- (inbound) ou mensagem sem atendente identificado.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_user_id uuid references public.users (id) on delete set null,
  message_type text not null default 'text',
  body text,
  storage_path text,
  file_name text,
  mime_type text,
  provider_message_id text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_messages_conversation on public.crm_messages (conversation_id, created_at);
create unique index if not exists idx_crm_messages_provider on public.crm_messages (provider_message_id)
  where provider_message_id is not null;

alter table public.crm_messages enable row level security;

drop policy if exists crm_messages_select on public.crm_messages;
create policy crm_messages_select on public.crm_messages
for select to authenticated using (public.wa_is_staff());

drop policy if exists crm_messages_insert on public.crm_messages;
create policy crm_messages_insert on public.crm_messages
for insert to authenticated with check (public.wa_is_staff());

drop policy if exists crm_messages_update on public.crm_messages;
create policy crm_messages_update on public.crm_messages
for update to authenticated using (false) with check (false);

drop policy if exists crm_messages_delete on public.crm_messages;
create policy crm_messages_delete on public.crm_messages
for delete to authenticated using (false);

-- last_message_at da conversa segue o último crm_messages.
create or replace function public.crm_touch_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.crm_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_crm_messages_touch on public.crm_messages;
create trigger trg_crm_messages_touch
after insert on public.crm_messages
for each row execute function public.crm_touch_conversation();

-- Realtime (lista de conversas + mensagens atualizando sozinhas no painel).
alter publication supabase_realtime add table public.crm_conversations;
alter publication supabase_realtime add table public.crm_messages;

-- bucket privado pra mídia recebida/enviada no chat (mesmo padrão de wa-attachments).
insert into storage.buckets (id, name, public)
values ('crm-attachments', 'crm-attachments', false)
on conflict (id) do nothing;

drop policy if exists crm_attachments_storage_read on storage.objects;
create policy crm_attachments_storage_read on storage.objects
for select to authenticated
using (bucket_id = 'crm-attachments' and public.wa_is_staff());

-- Escrita direto do painel (upload de mídia pra enviar): o próprio atendente
-- sobe o arquivo antes do envio (como em quote-attachments), então insert é
-- liberado pro staff; update/delete seguem só pela service role.
drop policy if exists crm_attachments_storage_insert on storage.objects;
create policy crm_attachments_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'crm-attachments' and public.wa_is_staff());
