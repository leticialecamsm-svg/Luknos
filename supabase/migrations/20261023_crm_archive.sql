-- Arquivar conversa (por atendente, como no WhatsApp): some da lista até o contato escrever de novo.
alter table public.crm_conversation_reads add column if not exists archived_at timestamptz;

drop function if exists public.crm_unread_counts(uuid, uuid[]);
create function public.crm_unread_counts(uid uuid, conv_ids uuid[])
returns table(conversation_id uuid, unread int, marked_unread boolean, stale int, archived boolean)
language sql stable set search_path = public as $$
  with base as (
    select c.id,
      r.last_read_at,
      coalesce(r.marked_unread, false) as marked,
      r.archived_at,
      (select max(m.created_at) from crm_messages m
        where m.conversation_id = c.id and m.direction = 'inbound' and not m.is_system and m.deleted_at is null) as last_in,
      (select max(m.created_at) from crm_messages m
        where m.conversation_id = c.id and m.direction = 'outbound' and not m.is_system and m.deleted_at is null) as last_out,
      (select at from crm_feature_baselines where name = 'unread') as baseline
    from unnest(conv_ids) as c(id)
    left join crm_conversation_reads r on r.conversation_id = c.id and r.user_id = uid
  )
  select b.id,
    (select count(*)::int from crm_messages m
      where m.conversation_id = b.id and m.direction = 'inbound' and not m.is_system and m.deleted_at is null
        and m.created_at > greatest(coalesce(b.last_read_at, b.baseline), coalesce(b.last_out, '-infinity'::timestamptz))),
    b.marked,
    (select case when min(m.created_at) < now() - interval '1 day' then count(*)::int else 0 end from crm_messages m
      where m.conversation_id = b.id and m.direction = 'inbound' and not m.is_system and m.deleted_at is null
        and m.created_at > coalesce(b.last_out, '-infinity'::timestamptz)
        and m.created_at <= b.last_read_at),
    b.archived_at is not null and b.archived_at >= coalesce(b.last_in, '-infinity'::timestamptz)
  from base b
$$;
revoke all on function public.crm_unread_counts(uuid, uuid[]) from anon, authenticated;
