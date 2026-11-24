-- Alivia o banco (plano gratuito do Supabase, pouca CPU): crm_instance_activity() levava ~2 s e era
-- chamada milhares de vezes (monitor + telas Conexões/faixa de saúde). Passa a ser calculada no
-- máximo a cada 90 s e as demais chamadas leem do cache.
create table if not exists public.crm_instance_activity_cache (
  instance_id uuid primary key,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  inbound_7d int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.crm_instance_activity_cache enable row level security;
revoke all on table public.crm_instance_activity_cache from anon, authenticated;
grant all on table public.crm_instance_activity_cache to service_role;

create or replace function public.crm_instance_activity()
returns table (instance_id uuid, last_inbound_at timestamptz, last_outbound_at timestamptz, inbound_7d int)
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from crm_instance_activity_cache a where a.updated_at > now() - interval '90 seconds') then
    -- só um recálculo por vez; os demais leem o que já existe
    if pg_try_advisory_xact_lock(7340001) then
      delete from crm_instance_activity_cache;
      insert into crm_instance_activity_cache (instance_id, last_inbound_at, last_outbound_at, inbound_7d, updated_at)
      select c.instance_id,
             max(m.created_at) filter (where m.direction = 'inbound'),
             max(m.created_at) filter (where m.direction = 'outbound' and not coalesce(m.is_system, false)),
             (count(*) filter (where m.direction = 'inbound'))::int,
             now()
      from crm_messages m
      join crm_conversations c on c.id = m.conversation_id
      where m.created_at > now() - interval '7 days'
      group by c.instance_id;
    end if;
  end if;
  return query select a.instance_id, a.last_inbound_at, a.last_outbound_at, a.inbound_7d from crm_instance_activity_cache a;
end
$$;
revoke all on function public.crm_instance_activity() from public, anon, authenticated;
grant execute on function public.crm_instance_activity() to service_role;

-- índice duplicado (mesmas colunas de crm_messages_conv_created_idx): cada mensagem gravada atualizava os dois
drop index if exists public.idx_crm_messages_conversation;

-- histórico do agendador (pg_cron): 190 mil linhas / 61 MB que ninguém consulta; mantém só 2 dias
delete from cron.job_run_details where end_time < now() - interval '2 days';
select cron.schedule('prune-cron-history', '17 3 * * *', $job$delete from cron.job_run_details where end_time < now() - interval '2 days'$job$);
