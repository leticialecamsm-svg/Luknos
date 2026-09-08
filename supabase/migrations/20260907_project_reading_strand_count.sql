-- Leitura de Projeto — quantidade de tiras de fita dentro do mesmo perfil
-- (perfis largos às vezes levam 2+ tiras de fita lado a lado).
alter table public.plan_measurements
  add column if not exists strand_count integer not null default 1 check (strand_count >= 1);
