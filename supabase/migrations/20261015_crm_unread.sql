-- Leitura por atendente (lida / não lida). Aplicada em produção via MCP (crm_unread).
create table if not exists public.crm_conversation_reads (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  marked_unread boolean not null default false,
  primary key (conversation_id, user_id)
);
alter table public.crm_conversation_reads enable row level security;
revoke all on public.crm_conversation_reads from anon, authenticated;

create table if not exists public.crm_feature_baselines (name text primary key, at timestamptz not null);
alter table public.crm_feature_baselines enable row level security;
revoke all on public.crm_feature_baselines from anon, authenticated;
insert into public.crm_feature_baselines(name, at) values ('unread', now()) on conflict (name) do nothing;

create or replace function public.crm_unread_counts(uid uuid, conv_ids uuid[])
returns table(conversation_id uuid, unread int, marked_unread boolean)
language sql stable set search_path = public as $$
  select c.id,
    (select count(*)::int from crm_messages m
      where m.conversation_id = c.id and m.direction = 'inbound' and not m.is_system and m.deleted_at is null
        and m.created_at > coalesce(r.last_read_at, (select at from crm_feature_baselines where name = 'unread'))),
    coalesce(r.marked_unread, false)
  from unnest(conv_ids) as c(id)
  left join crm_conversation_reads r on r.conversation_id = c.id and r.user_id = uid
$$;
