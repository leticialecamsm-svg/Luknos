-- O WhatsApp passou a identificar contatos também por um id anônimo (…@lid). O aviso de
-- "digitando" das conversas individuais chega com esse id; aqui fica a tradução para o número
-- (…@s.whatsapp.net) que o CRM usa. Preenchida pelo webhook na primeira vez, consultando a
-- Evolution (remoteJidAlt das mensagens). Só o servidor lê/grava (RLS sem políticas).
create table if not exists public.crm_lid_map (
  instance_id uuid not null references public.crm_instances(id) on delete cascade,
  lid text not null,
  jid text not null,
  updated_at timestamptz not null default now(),
  primary key (instance_id, lid)
);
alter table public.crm_lid_map enable row level security;
