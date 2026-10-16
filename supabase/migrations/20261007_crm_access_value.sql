-- CRM: acesso por WhatsApp (número privado), liberação de conversa avulsa e valor da negociação.
--
-- Regra de visibilidade de uma conversa (crm_can_see_conversation):
--   número NÃO privado  -> qualquer staff vê
--   número privado      -> só quem é dono (default_user_id), membro do número,
--                          atendente atual da conversa ou quem recebeu a conversa liberada.
-- Admin NÃO tem acesso automático a número privado (pode se incluir como membro em /crm-instances).

alter table public.crm_instances add column if not exists is_private boolean not null default false;

create table if not exists public.crm_instance_members (
  instance_id uuid not null references public.crm_instances(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (instance_id, user_id)
);

create table if not exists public.crm_conversation_access (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  granted_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists crm_conversation_access_user_idx on public.crm_conversation_access (user_id);

alter table public.crm_conversations
  add column if not exists deal_value numeric(12,2) check (deal_value is null or deal_value >= 0);

alter table public.crm_instance_members enable row level security;
alter table public.crm_conversation_access enable row level security;
create policy crm_instance_members_select on public.crm_instance_members for select using (wa_is_staff());
create policy crm_conversation_access_select on public.crm_conversation_access for select using (wa_is_staff());
-- escrita só pelo servidor (service role)

create or replace function public.crm_can_see_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select wa_is_staff() and exists (
    select 1
    from crm_conversations c
    join crm_instances i on i.id = c.instance_id
    where c.id = conv
      and (
        not i.is_private
        or c.assigned_user_id = auth.uid()
        or i.default_user_id = auth.uid()
        or exists (select 1 from crm_instance_members m where m.instance_id = i.id and m.user_id = auth.uid())
        or exists (select 1 from crm_conversation_access a where a.conversation_id = c.id and a.user_id = auth.uid())
      )
  )
$$;

drop policy if exists crm_conversations_select on public.crm_conversations;
create policy crm_conversations_select on public.crm_conversations for select using (crm_can_see_conversation(id));
drop policy if exists crm_conversations_update on public.crm_conversations;
create policy crm_conversations_update on public.crm_conversations for update using (crm_can_see_conversation(id));
drop policy if exists crm_messages_select on public.crm_messages;
create policy crm_messages_select on public.crm_messages for select using (crm_can_see_conversation(conversation_id));
