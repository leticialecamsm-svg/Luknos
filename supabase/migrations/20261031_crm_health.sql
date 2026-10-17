-- Monitoramento do CRM: estado de cada peça (servidor da Evolution, números de WhatsApp, servidor
-- da Hostinger, o próprio monitor) e histórico de quedas/recuperações. Quem escreve é a função
-- crm-health-check (a cada minuto, via pg_cron); a tela do CRM só lê.
create table if not exists public.crm_health (
  component text primary key,           -- evolution | vps | hostinger | monitor | instance:<id>
  label text not null,
  status text not null default 'ok' check (status in ('ok', 'warn', 'down')),
  detail text,                          -- frase curta para a faixa da tela
  reason text,                          -- motivo conhecido (ex.: manutenção na Hostinger)
  since timestamptz not null default now(),   -- desde quando está neste estado
  last_ok_at timestamptz,
  checked_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create table if not exists public.crm_health_events (
  id bigint generated always as identity primary key,
  component text not null,
  kind text not null,                   -- down | up | warn | recovery_start | recovery_restart | recovery_failed
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists crm_health_events_at_idx on public.crm_health_events (at desc);

alter table public.crm_health enable row level security;
alter table public.crm_health_events enable row level security;
revoke all on public.crm_health, public.crm_health_events from anon;
grant select on public.crm_health, public.crm_health_events to authenticated;
drop policy if exists crm_health_read on public.crm_health;
create policy crm_health_read on public.crm_health for select to authenticated using (true);
drop policy if exists crm_health_events_read on public.crm_health_events;
create policy crm_health_events_read on public.crm_health_events for select to authenticated using (true);

insert into public.internal_cron_secrets (name, secret)
values ('crm-health', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

select cron.schedule('crm-health-check', '* * * * *', $job$
  select net.http_post(
    url := 'https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/crm-health-check',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select secret from public.internal_cron_secrets where name = 'crm-health')),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  )
$job$);
