-- Fila diária de "atualizar negociação".
-- Cada dia, cada vendedor recebe uma lista curta (due) das negociações que
-- estão há tempo demais sem notícia; conforme atualiza, o id vai pra done.
-- Guardar os dois lados por dia é o que permite medir constância depois
-- (base da gamificação), sem precisar recalcular o passado.
create table if not exists public.negotiation_update_daily (
  user_id        uuid not null references public.users(id) on delete cascade,
  day            date not null,
  due_quote_ids  uuid[] not null default '{}',
  done_quote_ids uuid[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.negotiation_update_daily enable row level security;
-- sem policies: só o servidor (service role) lê e grava

-- Lembrete das 17h pelo robô: desligado até a Letícia ativar
alter table public.wa_bot_config
  add column if not exists update_reminder_enabled boolean not null default false;
