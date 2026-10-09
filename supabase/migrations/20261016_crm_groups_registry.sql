-- Cadastro dos grupos que cada número vê. Só os ativados (enabled) viram conversa no CRM.
-- Aplicada em produção via MCP (crm_groups_registry).
create table if not exists public.crm_groups (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.crm_instances(id) on delete cascade,
  jid text not null,
  name text,
  enabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (instance_id, jid)
);
alter table public.crm_groups enable row level security;
revoke all on public.crm_groups from anon, authenticated;

insert into public.crm_groups (instance_id, jid, name, enabled, last_seen_at)
select c.instance_id, c.remote_jid, c.contact_name_cache, true, coalesce(c.last_message_at, now())
from public.crm_conversations c
where c.remote_jid like '%@g.us'
on conflict (instance_id, jid) do nothing;
