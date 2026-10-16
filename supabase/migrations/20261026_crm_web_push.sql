-- Avisos de mensagem do CRM por Web Push (como o WhatsApp Web): o banner do sistema
-- (Mac/Windows) aparece mesmo com o Luknos em outra aba, minimizado ou em outro programa.
create table if not exists public.crm_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists crm_push_subscriptions_user_idx on public.crm_push_subscriptions (user_id);
alter table public.crm_push_subscriptions enable row level security;
revoke all on public.crm_push_subscriptions from anon, authenticated;

insert into public.internal_cron_secrets (name, secret)
values ('crm-push', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Cada mensagem recebida (do contato) avisa o sistema, que manda o push para quem atende.
-- pg_net é assíncrono: não atrasa a gravação da mensagem.
create or replace function public.crm_notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'inbound' and not new.is_system then
    perform net.http_post(
      url := 'https://luknos.vercel.app/api/push/crm-message',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select secret from public.internal_cron_secrets where name = 'crm-push')),
      body := jsonb_build_object('message_id', new.id),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $$;

drop trigger if exists crm_messages_push on public.crm_messages;
create trigger crm_messages_push after insert on public.crm_messages
  for each row execute function public.crm_notify_push();
