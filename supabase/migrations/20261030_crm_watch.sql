-- Quem está com uma conversa do número aberta e à vista (uma linha por aba). Serve para o número
-- só voltar a "offline" no WhatsApp quando NINGUÉM mais o estiver acompanhando: o "digitando…" do
-- contato só chega enquanto o número está online. Só o servidor lê/grava (RLS sem políticas).
create table if not exists public.crm_watch (
  instance_id uuid not null references public.crm_instances(id) on delete cascade,
  viewer text not null,
  seen_at timestamptz not null default now(),
  primary key (instance_id, viewer)
);
alter table public.crm_watch enable row level security;
