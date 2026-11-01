-- Funil de tráfego pago: devolve o ID do anúncio da Meta (ad_context.source_id) por anúncio.
-- O webhook passou a gravar source_id/ctwa_clid em crm_messages.ad_context (whatsapp-webhook v40);
-- os leads antigos do Status foram preenchidos pelo ID que já vinha no fim do link.

-- Preenchimento dos leads antigos do Status (idempotente).
update crm_messages
set ad_context = ad_context || jsonb_build_object('source_id', substring(ad_context->>'url' from '/status/preview/\d+/(\d+)'))
where ad_context is not null
  and not (ad_context ? 'source_id')
  and ad_context->>'url' ~ '/status/preview/\d+/\d+';

create or replace function public.trafego_crm_funnel(p_from timestamptz, p_to timestamptz)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with leads as (
    select * from crm_traffic_leads(p_from, p_to)
  ), enriched as (
    select l.*, s.name as stage_name,
      (select m.ad_context->>'source_id' from crm_messages m where m.id = l.entry_message_id) as ad_id,
      (select count(distinct q.id)
         from crm_messages m
         join crm_solicitation_links sl on sl.crm_message_id = m.id
         join quotes q on q.solicitation_id = sl.solicitation_id
        where m.conversation_id = l.conversation_id)::int as quotes_n,
      (select coalesce(sum(n.final_value), 0)
         from negotiations n
        where n.closed_at is not null and n.loss_reason is null
          and n.quote_id in (
            select q.id from crm_messages m
            join crm_solicitation_links sl on sl.crm_message_id = m.id
            join quotes q on q.solicitation_id = sl.solicitation_id
            where m.conversation_id = l.conversation_id)) as quote_won_value
    from leads l
    left join crm_stages s on s.id = l.stage_id
  ), by_ad as (
    select
      source,
      coalesce(title, case source when 'google' then 'Google' else '(sem título)' end) as title,
      thumb_hash,
      min(url) as url,
      coalesce(array_remove(array_agg(distinct ad_id), null), '{}') as ad_ids,
      count(*)::int as leads,
      count(first_reply_at)::int as replied,
      count(*) filter (where returning_contact)::int as returning_contacts,
      round(avg(extract(epoch from (first_reply_at - entry_at)) / 60)::numeric, 1) as avg_first_reply_min,
      count(*) filter (where has_solicitation)::int as with_solicitation,
      coalesce(sum(quotes_n), 0)::int as quotes,
      count(*) filter (where stage_name = 'Fechado' or quote_won_value > 0)::int as won,
      count(*) filter (where stage_name = 'Perdido')::int as lost,
      coalesce(sum(deal_value) filter (where stage_name = 'Fechado'), 0) as crm_won_value,
      coalesce(sum(deal_value) filter (where coalesce(stage_name, '') not in ('Fechado', 'Perdido')), 0) as open_pipeline_value,
      coalesce(sum(quote_won_value), 0) as quote_won_value
    from enriched
    group by source, 2, thumb_hash
  ), stages as (
    select source,
           coalesce(title, case source when 'google' then 'Google' else '(sem título)' end) as title,
           thumb_hash, jsonb_object_agg(sn, c) as stages
    from (
      select source, title, thumb_hash, coalesce(stage_name, 'Sem etapa') as sn, count(*)::int as c
      from enriched group by 1, 2, 3, 4
    ) x group by 1, 2, 3
  ), by_day as (
    select (entry_at at time zone 'America/Sao_Paulo')::date as day, source, count(*)::int as leads
    from enriched group by 1, 2
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', (select jsonb_build_object(
        'leads', coalesce(sum(leads), 0), 'replied', coalesce(sum(replied), 0),
        'with_solicitation', coalesce(sum(with_solicitation), 0), 'quotes', coalesce(sum(quotes), 0),
        'won', coalesce(sum(won), 0), 'lost', coalesce(sum(lost), 0),
        'crm_won_value', coalesce(sum(crm_won_value), 0),
        'open_pipeline_value', coalesce(sum(open_pipeline_value), 0),
        'quote_won_value', coalesce(sum(quote_won_value), 0)) from by_ad),
    'by_ad', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('stages', coalesce(s.stages, '{}'::jsonb)) order by a.leads desc)
                         from by_ad a left join stages s on s.source = a.source and s.title = a.title and s.thumb_hash = a.thumb_hash), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from by_day d), '[]'::jsonb)
  );
$function$;
