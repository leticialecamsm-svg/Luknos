-- Enviar sem a assinatura "*Nome:*" numa conversa + fixar conversas no topo (por atendente).
-- Aplicada em produção via MCP (crm_signature_and_pins).
alter table public.crm_conversations add column if not exists hide_signature boolean not null default false;

create table if not exists public.crm_conversation_pins (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  user_id uuid not null,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.crm_conversation_pins enable row level security;
revoke all on public.crm_conversation_pins from anon, authenticated;
