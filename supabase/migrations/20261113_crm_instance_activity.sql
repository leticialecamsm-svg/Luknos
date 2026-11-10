-- Atividade de cada número do CRM: última mensagem recebida/enviada e volume dos últimos 7 dias.
-- Usada pelo monitor (crm-health-check) para achar número "conectado mas mudo" e pela tela Conexões.
create index if not exists crm_messages_inbound_created_idx on public.crm_messages (created_at desc) where direction = 'inbound';
create index if not exists crm_messages_outbound_created_idx on public.crm_messages (created_at desc) where direction = 'outbound';

create or replace function public.crm_instance_activity()
returns table (instance_id uuid, last_inbound_at timestamptz, last_outbound_at timestamptz, inbound_7d int)
language sql
stable
security invoker
set search_path = public
as $$
  select c.instance_id,
         max(m.created_at) filter (where m.direction = 'inbound'),
         max(m.created_at) filter (where m.direction = 'outbound' and not coalesce(m.is_system, false)),
         (count(*) filter (where m.direction = 'inbound'))::int
  from crm_messages m
  join crm_conversations c on c.id = m.conversation_id
  where m.created_at > now() - interval '7 days'
  group by c.instance_id
$$;

revoke all on function public.crm_instance_activity() from public, anon, authenticated;
grant execute on function public.crm_instance_activity() to service_role;
