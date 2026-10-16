-- Preferências de visualização do quadro de Solicitações, por usuário e por
-- escopo (id da etapa ou 'all'): quais propriedades dos cartões aparecem e em
-- que ordem. Acesso só via admin client nas server actions.
create table if not exists solicitation_view_prefs (
  user_id uuid not null references users(id) on delete cascade,
  scope text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);
