-- Quem criou a tarefa (pode ser diferente de quem vai fazer, em user_id).
-- Até aqui toda tarefa era criada pela própria pessoa, então o histórico
-- recebe created_by = user_id.
alter table public.tasks add column if not exists created_by uuid references public.users(id) on delete set null;
update public.tasks set created_by = user_id where created_by is null;
create index if not exists tasks_created_by_idx on public.tasks (created_by) where created_by is not null;
