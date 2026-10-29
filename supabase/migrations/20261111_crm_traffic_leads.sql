-- Métricas do tráfego (CRM): cada conversa que entrou por tráfego no período, com o que aconteceu depois.
-- Entrada = primeira mensagem do cliente com dados de anúncio (ad_context) no período; se não houver,
-- a primeira com "vim pelo google". Uma mesma conversa pode contar em períodos diferentes (voltou por outro clique).
-- Depois da 1ª resposta: quantas mensagens o cliente mandou (0 = não voltou a falar com a equipe).
-- Primeira resposta: primeira mensagem nossa depois da entrada, ignorando os primeiros 15 s (resposta automática).
drop function if exists public.crm_traffic_leads(timestamptz, timestamptz);
create function public.crm_traffic_leads(p_from timestamptz, p_to timestamptz)
returns table (
  conversation_id uuid,
  entry_message_id uuid,
  entry_at timestamptz,
  source text,
  title text,
  thumb_hash text,
  url text,
  instance_id uuid,
  assigned_user_id uuid,
  contact_name text,
  remote_jid text,
  first_reply_at timestamptz,
  first_reply_user uuid,
  inbound_count int,
  outbound_count int,
  deal_value numeric,
  stage_id uuid,
  has_solicitation boolean,
  returning_contact boolean,
  inbound_after_reply int,     -- mensagens do cliente depois da nossa 1ª resposta (0 = não respondeu à equipe)
  last_inbound_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with ad as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.id as message_id, m.created_at as entry_at,
      coalesce(m.ad_context->>'source', 'facebook') as source,
      nullif(m.ad_context->>'title', '') as title,
      md5(coalesce(m.ad_context->>'thumb', m.ad_context->>'url', m.ad_context->>'title', '')) as thumb_hash,
      m.ad_context->>'url' as url
    from crm_messages m
    where m.ad_context is not null and m.created_at >= p_from and m.created_at < p_to
    order by m.conversation_id, m.created_at
  ), g as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.id, m.created_at, 'google'::text, null::text, 'google'::text, null::text
    from crm_messages m
    where m.direction = 'inbound' and m.body ilike '%vim pelo google%'
      and m.created_at >= p_from and m.created_at < p_to
      and not exists (select 1 from ad where ad.conversation_id = m.conversation_id)
    order by m.conversation_id, m.created_at
  ), leads as (
    select * from ad union all select * from g
  )
  select
    l.conversation_id, l.message_id, l.entry_at, l.source, l.title, l.thumb_hash, l.url,
    c.instance_id, c.assigned_user_id,
    coalesce(ct.name, c.contact_name_cache) as contact_name,
    c.remote_jid,
    r.created_at as first_reply_at,
    r.sender_user_id as first_reply_user,
    (select count(*) from crm_messages x where x.conversation_id = l.conversation_id and x.direction = 'inbound' and x.created_at >= l.entry_at)::int,
    (select count(*) from crm_messages x where x.conversation_id = l.conversation_id and x.direction = 'outbound' and not coalesce(x.is_system, false) and x.created_at >= l.entry_at)::int,
    c.deal_value,
    c.stage_id,
    exists (
      select 1 from crm_solicitation_links sl join crm_messages sm on sm.id = sl.crm_message_id
      where sm.conversation_id = l.conversation_id
    ),
    exists (
      select 1 from crm_messages p
      where p.conversation_id = l.conversation_id and not coalesce(p.is_system, false)
        and p.created_at < l.entry_at - interval '1 minute'
    ),
    (select count(*) from crm_messages x where x.conversation_id = l.conversation_id and x.direction = 'inbound' and r.created_at is not null and x.created_at > r.created_at)::int,
    (select max(x.created_at) from crm_messages x where x.conversation_id = l.conversation_id and x.direction = 'inbound')
  from leads l
  join crm_conversations c on c.id = l.conversation_id
  left join contacts ct on ct.id = c.contact_id
  left join lateral (
    select x.created_at, x.sender_user_id from crm_messages x
    where x.conversation_id = l.conversation_id and x.direction = 'outbound' and not coalesce(x.is_system, false)
      and x.created_at >= l.entry_at + interval '15 seconds'
    order by x.created_at
    limit 1
  ) r on true
$$;

revoke all on function public.crm_traffic_leads(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_traffic_leads(timestamptz, timestamptz) to service_role;
