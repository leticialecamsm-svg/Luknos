-- Leitura de Projeto — rotação de página (planta que veio em pé quando
-- deveria ser deitada) e "página de trabalho" (PDFs com várias páginas onde
-- só uma é a planta luminotécnica — o sistema lembra qual foi a última
-- página aberta).
alter table public.project_plans
  add column if not exists page_rotation jsonb not null default '{}'::jsonb,
  add column if not exists working_page int not null default 1;
