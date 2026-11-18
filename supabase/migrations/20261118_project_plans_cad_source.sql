-- Leitura de Projeto — plantas em CAD (DWG/DXF): cada região do desenho vira
-- uma página; cad_meta guarda unidade e as regiões (caixa + px por unidade).
alter table public.project_plans
  add column if not exists source_type text not null default 'pdf' check (source_type in ('pdf', 'cad')),
  add column if not exists cad_meta jsonb;
