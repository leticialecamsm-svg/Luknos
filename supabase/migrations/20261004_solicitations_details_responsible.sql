-- Lote 1b da feature "Solicitações":
-- 1. Campos de caracterização da Solicitação (antes ficavam em quotes).
--    Nullable: não quebra nada existente. Backfill opcional: pode rodar depois.
-- 2. responsible_id em visits e design_projects para rastrear responsável.

-- ── Campos de detalhes da Solicitação ───────────────────────────────────────

alter table solicitations
  add column if not exists category  text,
  add column if not exists size      text,
  add column if not exists origin    text,
  add column if not exists work_stage text,
  add column if not exists priority  text not null default 'normal';

-- ── Responsável em Visita ────────────────────────────────────────────────────
alter table visits
  add column if not exists responsible_id uuid references users(id);

-- ── Responsável em Projeto ───────────────────────────────────────────────────
alter table design_projects
  add column if not exists responsible_id uuid references users(id);

-- Backfill opcional: herda campos de quotes existentes quando solicitation_id
-- já está preenchido. Não é bloqueante; pode ser rodado depois.
-- update solicitations s
--   set category   = q.category,
--       size       = q.size,
--       origin     = q.origin,
--       work_stage = q.work_stage,
--       priority   = coalesce(q.priority, 'normal')
-- from quotes q
-- where q.solicitation_id = s.id
--   and s.category is null;
