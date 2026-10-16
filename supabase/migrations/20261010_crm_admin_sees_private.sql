-- Número privado esconde as conversas de quem NÃO é administrador. Administradores
-- (mesmos poderes) continuam vendo tudo, inclusive números privados.
-- (versão anterior da função: 20261007_crm_access_value.sql)
create or replace function public.crm_can_see_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select wa_is_staff() and exists (
    select 1
    from crm_conversations c
    join crm_instances i on i.id = c.instance_id
    where c.id = conv
      and (
        not i.is_private
        or wa_is_admin()
        or c.assigned_user_id = auth.uid()
        or i.default_user_id = auth.uid()
        or exists (select 1 from crm_instance_members m where m.instance_id = i.id and m.user_id = auth.uid())
        or exists (select 1 from crm_conversation_access a where a.conversation_id = c.id and a.user_id = auth.uid())
      )
  )
$$;
