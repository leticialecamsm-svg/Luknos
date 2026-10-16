-- Fotos de perfil do WhatsApp nas conversas do CRM.
-- A edge function crm-sync-photos busca a foto na Evolution, guarda uma cópia no
-- bucket público crm-avatars (o link do WhatsApp expira) e marca quando conferiu.

alter table public.crm_conversations
  add column if not exists contact_photo_checked_at timestamptz;

create index if not exists crm_conversations_photo_checked_idx
  on public.crm_conversations (contact_photo_checked_at nulls first);

insert into storage.buckets (id, name, public)
values ('crm-avatars', 'crm-avatars', true)
on conflict (id) do update set public = true;

-- senha própria da função, usada pelo pg_cron
insert into public.internal_cron_secrets (name, secret)
values ('crm-sync-photos', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- a cada 10 min: conversas novas primeiro, depois as conferidas há mais de 7 dias
select cron.unschedule('crm-sync-photos') where exists (select 1 from cron.job where jobname = 'crm-sync-photos');
select cron.schedule(
  'crm-sync-photos',
  '*/10 * * * *',
  $$select net.http_post(
      url := 'https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/crm-sync-photos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select secret from public.internal_cron_secrets where name = 'crm-sync-photos')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )$$
);
