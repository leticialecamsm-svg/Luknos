-- Mensagem antiga recuperada (horas depois) não dispara push nem tira o cartão da coluna do Quadro.
create or replace function public.crm_notify_push()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.direction = 'inbound' and not new.is_system and new.created_at > now() - interval '6 hours' then
    perform net.http_post(
      url := 'https://luknos.vercel.app/api/push/crm-message',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select secret from public.internal_cron_secrets where name = 'crm-push')),
      body := jsonb_build_object('message_id', new.id),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $function$;

create or replace function public.crm_restart_stage_on_inbound()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.created_at > now() - interval '6 hours' then
    update public.crm_conversations c set stage_id = null
    where c.id = new.conversation_id
      and c.stage_id in (select id from public.crm_stages where restart_on_inbound);
  end if;
  return new;
end $function$;
