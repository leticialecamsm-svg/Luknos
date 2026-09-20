-- Módulo de Treinamento: trilhas > módulos > aulas, com atribuição por
-- colaborador (prazo + módulos liberados) e progresso por aula.
--
-- RLS ligado e SEM policies de propósito: todas as leituras/escritas passam
-- por server actions com o admin client, que checam papel/atribuição no
-- código. Assim nenhum cliente consegue ler o conteúdo de uma trilha que não
-- foi atribuída a ele (nem direto pela API do Supabase).

create table if not exists public.training_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  emoji text not null default '🎓',
  target_days int,                       -- prazo padrão (dias) ao atribuir
  is_published boolean not null default false,
  position int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.training_tracks(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists training_modules_track_idx on public.training_modules(track_id, position);

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('text','image','pdf','youtube','drive','link')),
  body text,                             -- texto da aula / legenda
  url text,                              -- youtube, drive ou link externo
  file_path text,                        -- arquivo no bucket 'training' (pdf/imagem)
  file_name text,
  duration_min int not null default 5,
  xp int not null default 10,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists training_lessons_module_idx on public.training_lessons(module_id, position);

create table if not exists public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.training_tracks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  due_date date,
  allowed_module_ids uuid[],             -- null = todos os módulos da trilha
  unique (track_id, user_id)
);
create index if not exists training_assignments_user_idx on public.training_assignments(user_id);

create table if not exists public.training_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.training_tracks enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_assignments enable row level security;
alter table public.training_progress enable row level security;

insert into storage.buckets (id, name, public)
values ('training', 'training', false)
on conflict (id) do nothing;
