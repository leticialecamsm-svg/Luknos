-- Mensagem que chega de OUTRO número da equipe (ex.: Paulo respondendo pelo número da Luknos para
-- o WhatsApp da Letícia): guarda quem da equipe enviou, para o CRM mostrar a foto dele.
-- O WhatsApp usa o mesmo id da mensagem nos dois lados, então ligamos pelo provider_message_id.
alter table public.crm_messages
  add column if not exists team_sender_user_id uuid references public.users(id) on delete set null;

create index if not exists crm_messages_provider_only_idx
  on public.crm_messages (provider_message_id) where provider_message_id is not null;

-- chegou depois da enviada: procura quem enviou
create or replace function public.crm_link_team_sender_in() returns trigger language plpgsql as $$
begin
  if new.direction = 'inbound' and new.provider_message_id is not null and new.team_sender_user_id is null then
    select o.sender_user_id into new.team_sender_user_id
      from public.crm_messages o
     where o.provider_message_id = new.provider_message_id
       and o.direction = 'outbound' and not o.from_phone and o.sender_user_id is not null
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_link_team_sender_in on public.crm_messages;
create trigger trg_crm_link_team_sender_in before insert on public.crm_messages
  for each row execute function public.crm_link_team_sender_in();

-- a recebida chegou antes da enviada ser gravada: completa agora
create or replace function public.crm_link_team_sender_out() returns trigger language plpgsql as $$
begin
  if new.direction = 'outbound' and not new.from_phone and new.sender_user_id is not null and new.provider_message_id is not null then
    update public.crm_messages
       set team_sender_user_id = new.sender_user_id
     where provider_message_id = new.provider_message_id
       and direction = 'inbound' and team_sender_user_id is null;
  end if;
  return null;
end $$;

drop trigger if exists trg_crm_link_team_sender_out on public.crm_messages;
create trigger trg_crm_link_team_sender_out after insert on public.crm_messages
  for each row execute function public.crm_link_team_sender_out();

-- histórico: só o que já foi enviado pelo CRM (dá para saber quem enviou)
update public.crm_messages i
   set team_sender_user_id = o.sender_user_id
  from public.crm_messages o
 where i.direction = 'inbound' and i.team_sender_user_id is null
   and o.direction = 'outbound' and not o.from_phone and o.sender_user_id is not null
   and o.provider_message_id = i.provider_message_id;
