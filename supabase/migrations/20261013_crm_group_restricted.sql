-- Conversa restrita (usada nos grupos): só administradores, o atendente atual e quem foi
-- liberado enxergam; membros/donos do WhatsApp NÃO ganham acesso só por isso.
alter table public.crm_conversations add column if not exists is_restricted boolean not null default false;

create or replace function public.crm_can_see_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select wa_is_staff() and exists (
    select 1
    from crm_conversations c
    join crm_instances i on i.id = c.instance_id
    where c.id = conv
      and (
        wa_is_admin()
        or c.assigned_user_id = auth.uid()
        or exists (select 1 from crm_conversation_access a where a.conversation_id = c.id and a.user_id = auth.uid())
        or (
          not c.is_restricted
          and (
            not i.is_private
            or i.default_user_id = auth.uid()
            or exists (select 1 from crm_instance_members m where m.instance_id = i.id and m.user_id = auth.uid())
          )
        )
      )
  )
$$;
