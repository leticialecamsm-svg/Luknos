-- Leitura de Projeto — adiciona o tipo "medida" (medição genérica, sem
-- entrar no plano de corte de perfil/fita) ao lado de perfil/fita.
alter table public.plan_measurements drop constraint plan_measurements_kind_check;
alter table public.plan_measurements add constraint plan_measurements_kind_check check (kind in ('perfil', 'fita', 'medida'));
