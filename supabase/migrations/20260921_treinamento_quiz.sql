-- Quiz por aula: perguntas de múltipla escolha + tentativas dos colaboradores.
-- RLS ligado e SEM policies: tudo passa por server actions (o gabarito só é
-- comparado no servidor, nunca enviado ao navegador antes da correção).

create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  explanation text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists training_quiz_questions_lesson_idx on public.training_quiz_questions(lesson_id, position);

create table if not exists public.training_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  correct int not null,
  total int not null,
  score int not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists training_quiz_attempts_user_lesson_idx on public.training_quiz_attempts(user_id, lesson_id);

alter table public.training_quiz_questions enable row level security;
alter table public.training_quiz_attempts enable row level security;
