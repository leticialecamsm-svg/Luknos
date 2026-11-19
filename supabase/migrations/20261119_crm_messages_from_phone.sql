-- Mensagem enviada pelo celular (fora do CRM): não dá para saber quem digitou,
-- então a tela mostra sempre o ícone do celular, nunca a foto/nome do consultor.
-- sender_user_id continua guardando o dono do número (métricas e permissões não mudam).
alter table public.crm_messages add column if not exists from_phone boolean not null default false;

-- O webhook grava a mensagem do celular sem `signed` e sem arquivo; tudo que o CRM envia traz
-- `signed` (verdadeiro/falso) ou um arquivo (figurinha/mídia). Avisos do sistema e cartões de
-- contato ficam de fora.
create or replace function public.crm_flag_phone_message() returns trigger language plpgsql as $$
begin
  if new.direction = 'outbound'
     and new.signed is null
     and new.storage_path is null
     and not coalesce(new.is_system, false)
     and coalesce(new.message_type, '') <> 'other' then
    new.from_phone := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_flag_phone_message on public.crm_messages;
create trigger trg_crm_flag_phone_message before insert on public.crm_messages
  for each row execute function public.crm_flag_phone_message();
