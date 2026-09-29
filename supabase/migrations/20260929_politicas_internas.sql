-- Módulo de Políticas Internas: documentos > tópicos, com leitura obrigatória
-- até o fim de cada tópico e assinatura (concordância) por tópico. Atribuição
-- por colaborador (não é aberto a todos por padrão).
--
-- Mesmo padrão do Treinamento: RLS ligado e SEM policies; tudo passa por
-- server actions com o admin client, que checam login/papel/atribuição no
-- código. A assinatura é um registro legal (timestamp), por isso não há
-- "desfazer" para o colaborador.

create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_published boolean not null default false,
  position int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_topics (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  title text not null,
  body text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists policy_topics_document_idx on public.policy_topics(document_id, position);

create table if not exists public.policy_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (document_id, user_id)
);
create index if not exists policy_assignments_user_idx on public.policy_assignments(user_id);

create table if not exists public.policy_acknowledgments (
  user_id uuid not null references public.users(id) on delete cascade,
  topic_id uuid not null references public.policy_topics(id) on delete cascade,
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index if not exists policy_acknowledgments_doc_user_idx on public.policy_acknowledgments(document_id, user_id);

alter table public.policy_documents enable row level security;
alter table public.policy_topics enable row level security;
alter table public.policy_assignments enable row level security;
alter table public.policy_acknowledgments enable row level security;
