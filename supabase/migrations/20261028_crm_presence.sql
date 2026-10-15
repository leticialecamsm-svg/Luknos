-- "Digitando…" do CRM: quem está digitando em cada conversa (o contato, pelo WhatsApp, ou um
-- atendente, pelo CRM). Uma linha por (conversa, quem); é sobrescrita a cada aviso e vale por
-- poucos segundos (a tela ignora linhas antigas), então não cresce.
create table if not exists public.crm_presence (
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  actor text not null,            -- 'contact' (ou o JID do participante, em grupo) | id do atendente
  actor_name text,
  state text not null check (state in ('composing', 'recording', 'paused')),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, actor)
);

alter table public.crm_presence enable row level security;
-- lê quem pode ver a conversa (mesma regra das mensagens); só o servidor grava
drop policy if exists crm_presence_select on public.crm_presence;
create policy crm_presence_select on public.crm_presence for select to authenticated
  using (public.crm_can_see_conversation(conversation_id));

alter publication supabase_realtime add table public.crm_presence;
