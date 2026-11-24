-- Menção a alguém da equipe numa conversa (@Paulo): vira aviso para a pessoa (cartão na tela + push).
create table if not exists public.crm_mentions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  message_id uuid references public.crm_messages(id) on delete set null,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  by_user_id uuid references public.users(id) on delete set null,
  preview text,
  by_name text,
  by_photo text,
  conv_name text,
  created_at timestamptz not null default now()
);
create index if not exists crm_mentions_user_idx on public.crm_mentions (mentioned_user_id, created_at desc);
alter table public.crm_mentions enable row level security;
create policy crm_mentions_select_own on public.crm_mentions for select using (mentioned_user_id = auth.uid());
alter publication supabase_realtime add table public.crm_mentions;
