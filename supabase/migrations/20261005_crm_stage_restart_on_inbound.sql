-- Coluna pode ser marcada "volta ao início quando o cliente escrever"
-- (ex.: Perdido). Cliente que escreve de novo recomeça o ciclo: stage_id NULL
-- = primeira coluna. Só mensagem inbound de cliente conta (não a do sistema).
alter table public.crm_stages add column if not exists restart_on_inbound boolean not null default false;
update public.crm_stages set restart_on_inbound = true where name = 'Perdido';

create or replace function public.crm_restart_stage_on_inbound() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.crm_conversations c set stage_id = null
  where c.id = new.conversation_id
    and c.stage_id in (select id from public.crm_stages where restart_on_inbound);
  return new;
end $$;

drop trigger if exists trg_crm_messages_restart_stage on public.crm_messages;
create trigger trg_crm_messages_restart_stage after insert on public.crm_messages
  for each row when (new.direction = 'inbound' and not new.is_system)
  execute function public.crm_restart_stage_on_inbound();
