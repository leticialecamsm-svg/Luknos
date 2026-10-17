-- Canais da Empresa: os grupos da empresa aparecem uma vez só (o mesmo grupo existe em vários números).
-- is_main = número principal da loja: é o "meu WhatsApp" de quem não tem número próprio (ex.: administrador).
alter table public.crm_instances add column if not exists is_main boolean not null default false;
update public.crm_instances set is_main = true where instance_name = 'Loja';

-- Foto de perfil de quem fala nos grupos (cópia no bucket crm-avatars: o link do WhatsApp expira).
-- Só o servidor lê/grava.
create table if not exists public.crm_participant_photos (
  instance_id uuid not null references public.crm_instances(id) on delete cascade,
  participant_jid text not null,
  photo_url text,
  checked_at timestamptz not null default now(),
  primary key (instance_id, participant_jid)
);
alter table public.crm_participant_photos enable row level security;
