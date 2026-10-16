-- Reações a mensagens (uma por quem reage). Aplicada em produção via MCP (crm_message_reactions).
create table if not exists public.crm_message_reactions (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  target_provider_id text not null,
  reactor text not null,
  from_me boolean not null default false,
  emoji text not null,
  reactor_name text,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, target_provider_id, reactor)
);
alter table public.crm_message_reactions enable row level security;
revoke all on public.crm_message_reactions from anon, authenticated;
