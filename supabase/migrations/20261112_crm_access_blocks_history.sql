-- CRM: quem vê cada conversa (bloqueio por pessoa, grupos só do dono do número, "fechar para todos")
-- e histórico de ocorrências de cada conversa.
--
-- Regras de quem vê (crm_can_see_conversation, espelhada em loadScope/conversationAccess no app):
--  - administrador vê tudo;
--  - bloqueado na conversa (crm_conversation_blocks) não vê, mesmo sendo o atendente ou tendo o número;
--  - atendente da conversa e quem foi liberado (crm_conversation_access) veem;
--  - conversa fechada para todos (is_restricted): além deles, só o dono do número (default_user_id);
--  - grupo de número com groups_private: só o dono do número (e os acima);
--  - o resto segue o número (aberto, ou privado para dono/membros).
-- Quem pode bloquear/fechar: administradores e quem tem users.crm_access_manager (Jennifer).

alter table public.crm_instances add column if not exists groups_private boolean not null default false;
alter table public.users add column if not exists crm_access_manager boolean not null default false;
update public.users set crm_access_manager = true where name = 'Jennifer' and active; -- Jennifer

create table if not exists public.crm_conversation_blocks (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists crm_conversation_blocks_user on public.crm_conversation_blocks(user_id);
alter table public.crm_conversation_blocks enable row level security;
-- sem políticas: só o servidor (service role) lê e escreve

drop trigger if exists audit_crm_conversation_blocks on public.crm_conversation_blocks;
create trigger audit_crm_conversation_blocks after insert or update or delete on public.crm_conversation_blocks
  for each row execute function public.audit_row_change();

create or replace function public.crm_can_see_conversation(conv uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select wa_is_staff() and exists (
    select 1
    from crm_conversations c
    join crm_instances i on i.id = c.instance_id
    where c.id = conv
      and (
        wa_is_admin()
        or (
          not exists (select 1 from crm_conversation_blocks b where b.conversation_id = c.id and b.user_id = auth.uid())
          and (
            c.assigned_user_id = auth.uid()
            or exists (select 1 from crm_conversation_access a where a.conversation_id = c.id and a.user_id = auth.uid())
            or (c.is_restricted and i.default_user_id = auth.uid())
            or (
              not c.is_restricted
              and (not (i.groups_private and c.remote_jid like '%@g.us') or i.default_user_id = auth.uid())
              and (
                not i.is_private
                or i.default_user_id = auth.uid()
                or exists (select 1 from crm_instance_members m where m.instance_id = i.id and m.user_id = auth.uid())
              )
            )
          )
        )
      )
  )
$$;

-- ─── Histórico de ocorrências ────────────────────────────────────────────────
-- Gravado por gatilho: vale para qualquer caminho (tela, robô, webhook). actor_id nulo = automático.
create table if not exists public.crm_conversation_events (
  id bigserial primary key,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references public.users(id) on delete set null,
  kind text not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists crm_conversation_events_conv on public.crm_conversation_events(conversation_id, at desc);
alter table public.crm_conversation_events enable row level security;

create or replace function public.crm_conv_event(conv uuid, k text, d jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into crm_conversation_events (conversation_id, actor_id, kind, data)
  select conv, public.audit_actor(), k, coalesce(d, '{}'::jsonb)
  where conv is not null and exists (select 1 from crm_conversations where id = conv)
$$;

create or replace function public.crm_conv_event_log()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  conv uuid;
begin
  if tg_table_name = 'crm_conversations' then
    if tg_op = 'INSERT' then
      perform crm_conv_event(new.id, 'created', jsonb_build_object('assigned_user_id', new.assigned_user_id, 'instance_id', new.instance_id));
    elsif tg_op = 'UPDATE' then
      if new.assigned_user_id is distinct from old.assigned_user_id then
        perform crm_conv_event(new.id, 'assigned', jsonb_build_object('from', old.assigned_user_id, 'to', new.assigned_user_id));
      end if;
      if new.stage_id is distinct from old.stage_id then
        perform crm_conv_event(new.id, 'stage', jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
      end if;
      if new.deal_value is distinct from old.deal_value then
        perform crm_conv_event(new.id, 'value', jsonb_build_object('from', old.deal_value, 'to', new.deal_value));
      end if;
      if new.is_restricted is distinct from old.is_restricted then
        perform crm_conv_event(new.id, 'restricted', jsonb_build_object('to', new.is_restricted));
      end if;
      if new.contact_id is distinct from old.contact_id then
        perform crm_conv_event(new.id, 'contact', jsonb_build_object('from', old.contact_id, 'to', new.contact_id));
      end if;
      if new.status is distinct from old.status then
        perform crm_conv_event(new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status));
      end if;
    end if;
    return null;
  end if;

  if tg_table_name = 'crm_conversation_labels' then
    if tg_op = 'INSERT' then perform crm_conv_event(new.conversation_id, 'label_add', jsonb_build_object('label_id', new.label_id));
    elsif tg_op = 'DELETE' then perform crm_conv_event(old.conversation_id, 'label_remove', jsonb_build_object('label_id', old.label_id)); end if;
  elsif tg_table_name = 'crm_conversation_access' then
    if tg_op = 'INSERT' then perform crm_conv_event(new.conversation_id, 'share', jsonb_build_object('user_id', new.user_id));
    elsif tg_op = 'DELETE' then perform crm_conv_event(old.conversation_id, 'unshare', jsonb_build_object('user_id', old.user_id)); end if;
  elsif tg_table_name = 'crm_conversation_blocks' then
    if tg_op = 'INSERT' then perform crm_conv_event(new.conversation_id, 'block', jsonb_build_object('user_id', new.user_id));
    elsif tg_op = 'DELETE' then perform crm_conv_event(old.conversation_id, 'unblock', jsonb_build_object('user_id', old.user_id)); end if;
  elsif tg_table_name = 'tasks' then
    if tg_op = 'INSERT' and new.crm_conversation_id is not null then
      perform crm_conv_event(new.crm_conversation_id, 'followup', jsonb_build_object('due', new.due_date, 'user_id', new.user_id, 'note', left(new.description, 140)));
    elsif tg_op = 'UPDATE' and new.crm_conversation_id is not null and new.status is distinct from old.status and new.status = 'done' then
      perform crm_conv_event(new.crm_conversation_id, 'followup_done', jsonb_build_object('due', new.due_date, 'note', left(new.description, 140)));
    end if;
  elsif tg_table_name = 'crm_solicitation_links' then
    if tg_op = 'INSERT' then
      select m.conversation_id into conv from crm_messages m where m.id = new.crm_message_id;
      perform crm_conv_event(conv, 'solicitation', jsonb_build_object('solicitation_id', new.solicitation_id, 'stage', new.stage));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists crm_events_conversations on public.crm_conversations;
create trigger crm_events_conversations after insert or update on public.crm_conversations
  for each row execute function public.crm_conv_event_log();
drop trigger if exists crm_events_labels on public.crm_conversation_labels;
create trigger crm_events_labels after insert or delete on public.crm_conversation_labels
  for each row execute function public.crm_conv_event_log();
drop trigger if exists crm_events_access on public.crm_conversation_access;
create trigger crm_events_access after insert or delete on public.crm_conversation_access
  for each row execute function public.crm_conv_event_log();
drop trigger if exists crm_events_blocks on public.crm_conversation_blocks;
create trigger crm_events_blocks after insert or delete on public.crm_conversation_blocks
  for each row execute function public.crm_conv_event_log();
drop trigger if exists crm_events_tasks on public.tasks;
create trigger crm_events_tasks after insert or update on public.tasks
  for each row execute function public.crm_conv_event_log();
drop trigger if exists crm_events_solicitation_links on public.crm_solicitation_links;
create trigger crm_events_solicitation_links after insert on public.crm_solicitation_links
  for each row execute function public.crm_conv_event_log();

-- ─── Passado: o que já existe vira histórico ─────────────────────────────────
-- criação de cada conversa e o registro de atividade (audit_log, desde 28/10/2026) das mudanças feitas por pessoas
insert into public.crm_conversation_events (conversation_id, at, actor_id, kind, data)
select c.id, c.created_at, null, 'created', jsonb_build_object('assigned_user_id', null, 'instance_id', c.instance_id)
from public.crm_conversations c
where not exists (select 1 from public.crm_conversation_events e where e.conversation_id = c.id and e.kind = 'created');

insert into public.crm_conversation_events (conversation_id, at, actor_id, kind, data)
select a.row_id::uuid, a.at, a.actor_id, x.kind,
  case when x.kind = 'restricted' then jsonb_build_object('to', a.changes -> x.col -> 1)
       else jsonb_build_object('from', a.changes -> x.col -> 0, 'to', a.changes -> x.col -> 1) end
from public.audit_log a
cross join lateral (values ('assigned_user_id', 'assigned'), ('stage_id', 'stage'), ('deal_value', 'value'), ('is_restricted', 'restricted'), ('contact_id', 'contact'), ('status', 'status')) as x(col, kind)
where a.table_name = 'crm_conversations' and a.op = 'update' and a.changes ? x.col
  and exists (select 1 from public.crm_conversations c where c.id::text = a.row_id);

insert into public.crm_conversation_events (conversation_id, at, actor_id, kind, data)
select (a.changes ->> 'conversation_id')::uuid, a.at, a.actor_id,
  case a.op when 'insert' then 'label_add' else 'label_remove' end,
  jsonb_build_object('label_id', a.changes ->> 'label_id')
from public.audit_log a
where a.table_name = 'crm_conversation_labels' and a.op in ('insert', 'delete')
  and exists (select 1 from public.crm_conversations c where c.id::text = a.changes ->> 'conversation_id');

insert into public.crm_conversation_events (conversation_id, at, actor_id, kind, data)
select (a.changes ->> 'conversation_id')::uuid, a.at, a.actor_id,
  case a.op when 'insert' then 'share' else 'unshare' end,
  jsonb_build_object('user_id', a.changes ->> 'user_id')
from public.audit_log a
where a.table_name = 'crm_conversation_access' and a.op in ('insert', 'delete')
  and exists (select 1 from public.crm_conversations c where c.id::text = a.changes ->> 'conversation_id');
