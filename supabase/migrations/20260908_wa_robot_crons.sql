-- ============================================================================
-- Robô de Orçamentos WhatsApp — Fase 3 (RPCs + Cron)
--   - fn_expire_stale_conversations(): expira conversas paradas
--   - fn_get_bot_stats(range): métricas para /bot-dashboard
--   - wa_invoke_edge(): wrapper pg_net -> Edge Function (lê service_role_key do Vault)
--   - 3 jobs pg_cron
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- fn_expire_stale_conversations(p_hours) — cron a cada 30 min
-- ---------------------------------------------------------------------------
create or replace function public.fn_expire_stale_conversations(p_hours int default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.wa_conversations
       set status = 'expired'
     where status in ('collecting', 'awaiting_confirmation')
       and last_message_at < now() - make_interval(hours => p_hours)
    returning 1
  )
  select count(*) into v_count from expired;
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.fn_expire_stale_conversations(int) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- fn_get_bot_stats(range) — RPC do painel (/bot-dashboard)
-- range: 'today' | 'Nd' (ex '7d','30d'); default '30d'
-- ---------------------------------------------------------------------------
create or replace function public.fn_get_bot_stats(p_range text default '30d')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  if not public.wa_is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_since := case
    when p_range = 'today' then date_trunc('day', now())
    when p_range ~ '^\d+d$' then now() - make_interval(days => (regexp_replace(p_range, 'd$', ''))::int)
    else now() - interval '30 days'
  end;

  select jsonb_build_object(
    'range', p_range,
    'since', v_since,
    'submitted', (select count(*) from wa_conversations where status = 'submitted' and updated_at >= v_since),
    'failed', (select count(*) from wa_conversations where status = 'failed' and updated_at >= v_since),
    'active', (select count(*) from wa_conversations where status = 'collecting'),
    'awaiting_confirmation', (select count(*) from wa_conversations where status = 'awaiting_confirmation'),
    'expired', (select count(*) from wa_conversations where status = 'expired' and updated_at >= v_since),
    'cancelled', (select count(*) from wa_conversations where status = 'cancelled' and updated_at >= v_since),
    'avg_minutes_to_submit', (
      select round(avg(extract(epoch from (updated_at - created_at)) / 60)::numeric, 1)
        from wa_conversations
       where status = 'submitted' and updated_at >= v_since
    ),
    'notifications_sent', (select count(*) from wa_notifications where status = 'sent' and updated_at >= v_since),
    'notifications_failed', (select count(*) from wa_notifications where status = 'failed' and updated_at >= v_since),
    'submission_attempts', (select count(*) from wa_submission_log where created_at >= v_since),
    'submission_failures', (select count(*) from wa_submission_log where success = false and created_at >= v_since),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
        from (
          select date_trunc('day', updated_at)::date d, count(*) c
            from wa_conversations
           where status = 'submitted' and updated_at >= v_since
           group by 1
        ) x
    ),
    'by_origin', (
      select coalesce(jsonb_agg(jsonb_build_object('origin', o, 'count', c) order by c desc), '[]'::jsonb)
        from (
          select coalesce(collected_data->>'origin', '?') o, count(*) c
            from wa_conversations
           where status = 'submitted' and updated_at >= v_since
           group by 1
        ) x
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', ct, 'count', c) order by c desc), '[]'::jsonb)
        from (
          select coalesce(collected_data->>'category', '?') ct, count(*) c
            from wa_conversations
           where status = 'submitted' and updated_at >= v_since
           group by 1
        ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.fn_get_bot_stats(text) from anon;
grant execute on function public.fn_get_bot_stats(text) to authenticated;

-- ---------------------------------------------------------------------------
-- wa_invoke_edge(fn, body) — dispara uma Edge Function via pg_net.
-- Lê o service_role_key do Vault (secret 'service_role_key'). Enquanto esse
-- secret não existir, a função não faz nada (os crons ficam inertes até o
-- go-live) — sem gerar ruído de requisições 401/404.
-- ---------------------------------------------------------------------------
create or replace function public.wa_invoke_edge(p_fn text, p_body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_key text;
  v_base text := 'https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/';
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if v_key is null then
    return; -- não configurado ainda
  end if;

  perform net.http_post(
    url := v_base || p_fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-internal-call', '1'
    ),
    body := coalesce(p_body, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.wa_invoke_edge(text, jsonb) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cron jobs (cron.schedule faz upsert por nome)
-- ---------------------------------------------------------------------------
select cron.schedule(
  'wa-notification-worker', '* * * * *',
  $$select public.wa_invoke_edge('notification-worker')$$
);
select cron.schedule(
  'wa-retry-failed-submissions', '*/15 * * * *',
  $$select public.wa_invoke_edge('retry-failed-submissions')$$
);
select cron.schedule(
  'wa-expire-stale-conversations', '*/30 * * * *',
  $$select public.fn_expire_stale_conversations()$$
);
