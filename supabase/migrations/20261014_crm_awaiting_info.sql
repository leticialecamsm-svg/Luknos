-- Conversas em que a última mensagem (não de sistema) é do cliente: "aguardando resposta".
-- waiting_since = primeira mensagem do cliente depois da última resposta nossa.
create or replace function public.crm_awaiting_info(conv_ids uuid[])
returns table(conversation_id uuid, waiting_since timestamptz, unanswered int, body text, message_type text)
language sql stable set search_path = public as $$
  select c.id, w.since, w.n, l.body, l.message_type
  from unnest(conv_ids) as c(id)
  join lateral (
    select x.direction, x.body, x.message_type from crm_messages x
    where x.conversation_id = c.id and not x.is_system and x.deleted_at is null
    order by x.created_at desc limit 1
  ) l on l.direction = 'inbound'
  join lateral (
    select min(i.created_at) as since, count(*)::int as n from crm_messages i
    where i.conversation_id = c.id and i.direction = 'inbound' and not i.is_system and i.deleted_at is null
      and i.created_at > coalesce((
        select max(o.created_at) from crm_messages o
        where o.conversation_id = c.id and o.direction = 'outbound' and not o.is_system and o.deleted_at is null
      ), '-infinity'::timestamptz)
  ) w on true
$$;
revoke all on function public.crm_awaiting_info(uuid[]) from anon;
