-- Backfill único (idempotente) de solicitations para os dados que já
-- existiam antes da feature. Cada passo é guardado por
-- "WHERE solicitation_id IS NULL", então rodar este arquivo de novo não
-- duplica nada — é seguro reexecutar.
--
-- Estratégia: 1 solicitation por quotes.id (reaproveita client_id/
-- architect_id do próprio orçamento), propagada para negotiations/shipments
-- através do quote_id que cada um já tem, e para visits/design_projects
-- que apontam pra esse quote_id. Visits/design_projects órfãos (sem
-- quote_id, caso possível desde a migration de "solicitação pode nascer
-- como Visita/Projeto") ganham uma solicitation própria cada.

-- ── Passo 1: uma solicitation por orçamento existente ───────────────────
-- quotes.solicitation_id ainda é null para todo orçamento pré-feature.
-- NOTA: quotes NÃO tem coluna created_by (conferido no schema real antes de
-- aplicar) — solicitations.created_by fica null para solicitations nascidas
-- de um quote pré-existente; created_by só é preenchido para Solicitações
-- criadas de agora em diante pela tela nova.
insert into solicitations (client_id, architect_id, created_at)
select q.client_id, q.architect_id, q.created_at
from quotes q
where q.solicitation_id is null;

-- Linka cada quote recém-processado à solicitation que acabou de nascer
-- pra ele. Conferido no schema real: não há dois quotes com o mesmo
-- (client_id, architect_id, created_at), então esse trio já identifica a
-- linha sem ambiguidade — mesmo assim usamos row_number como cinto de
-- segurança caso isso mude no futuro.
with novas as (
  select id, client_id, architect_id, created_at,
         row_number() over (partition by client_id, architect_id, created_at order by id) as rn
  from solicitations
  where id not in (select solicitation_id from quotes where solicitation_id is not null)
),
alvo as (
  select q.id as quote_id, q.client_id, q.architect_id, q.created_at,
         row_number() over (partition by q.client_id, q.architect_id, q.created_at order by q.id) as rn
  from quotes q
  where q.solicitation_id is null
)
update quotes q
set solicitation_id = n.id
from novas n, alvo a
where a.quote_id = q.id
  and a.client_id = n.client_id
  and coalesce(a.architect_id::text, '') = coalesce(n.architect_id::text, '')
  and a.created_at = n.created_at
  and a.rn = n.rn;

-- ── Passo 2: propaga para negotiations via quotes.solicitation_id ───────
update negotiations n
set solicitation_id = q.solicitation_id
from quotes q
where n.quote_id = q.id
  and n.solicitation_id is null
  and q.solicitation_id is not null;

-- ── Passo 3: propaga para shipments via quotes.solicitation_id ──────────
update shipments s
set solicitation_id = q.solicitation_id
from quotes q
where s.quote_id = q.id
  and s.solicitation_id is null
  and q.solicitation_id is not null;

-- ── Passo 4: propaga para visits com quote_id ────────────────────────────
update visits v
set solicitation_id = q.solicitation_id
from quotes q
where v.quote_id = q.id
  and v.solicitation_id is null
  and q.solicitation_id is not null;

-- ── Passo 5: propaga para design_projects com quote_id ───────────────────
update design_projects dp
set solicitation_id = q.solicitation_id
from quotes q
where dp.quote_id = q.id
  and dp.solicitation_id is null
  and q.solicitation_id is not null;

-- ── Passo 6: visits órfãs (sem quote_id) ganham solicitation própria ────
-- Só possível para visits com client_id preenchido (obrigatório em
-- solicitations.client_id); visits muito antigas sem client_id ficam sem
-- solicitation mesmo — não bloqueiam nada, o app já trata solicitation_id
-- nulo normalmente.
insert into solicitations (client_id, architect_id, created_by, created_at)
select v.client_id, v.architect_id, v.created_by, v.created_at
from visits v
where v.solicitation_id is null
  and v.quote_id is null
  and v.client_id is not null;

with novas as (
  select id, client_id, architect_id, created_by, created_at,
         row_number() over (partition by client_id, architect_id, created_by, created_at order by id) as rn
  from solicitations
  where id not in (select solicitation_id from visits where solicitation_id is not null)
    and id not in (select solicitation_id from quotes where solicitation_id is not null)
),
alvo as (
  select v.id as visit_id, v.client_id, v.architect_id, v.created_by, v.created_at,
         row_number() over (partition by v.client_id, v.architect_id, v.created_by, v.created_at order by v.id) as rn
  from visits v
  where v.solicitation_id is null and v.quote_id is null and v.client_id is not null
)
update visits v
set solicitation_id = n.id
from novas n, alvo a
where a.visit_id = v.id
  and a.client_id = n.client_id
  and coalesce(a.architect_id::text, '') = coalesce(n.architect_id::text, '')
  and coalesce(a.created_by::text, '') = coalesce(n.created_by::text, '')
  and a.created_at = n.created_at
  and a.rn = n.rn;

-- ── Passo 7: design_projects órfãos (sem quote_id) ganham solicitation própria ──
insert into solicitations (client_id, architect_id, created_by, created_at)
select dp.client_id, dp.architect_id, dp.created_by, dp.created_at
from design_projects dp
where dp.solicitation_id is null
  and dp.quote_id is null
  and dp.client_id is not null;

with novas as (
  select id, client_id, architect_id, created_by, created_at,
         row_number() over (partition by client_id, architect_id, created_by, created_at order by id) as rn
  from solicitations
  where id not in (select solicitation_id from design_projects where solicitation_id is not null)
    and id not in (select solicitation_id from quotes where solicitation_id is not null)
    and id not in (select solicitation_id from visits where solicitation_id is not null)
),
alvo as (
  select dp.id as dp_id, dp.client_id, dp.architect_id, dp.created_by, dp.created_at,
         row_number() over (partition by dp.client_id, dp.architect_id, dp.created_by, dp.created_at order by dp.id) as rn
  from design_projects dp
  where dp.solicitation_id is null and dp.quote_id is null and dp.client_id is not null
)
update design_projects dp
set solicitation_id = n.id
from novas n, alvo a
where a.dp_id = dp.id
  and a.client_id = n.client_id
  and coalesce(a.architect_id::text, '') = coalesce(n.architect_id::text, '')
  and coalesce(a.created_by::text, '') = coalesce(n.created_by::text, '')
  and a.created_at = n.created_at
  and a.rn = n.rn;

-- NOTA (achado da investigação de código, ver relatório final): não foi
-- encontrado nenhum "insert into negotiations" nas migrations rastreadas
-- em supabase/migrations/ nem em src/lib/actions.ts — só updates. Como a
-- própria tabela `negotiations` (e `quotes`) não tem CREATE TABLE neste
-- repositório (schema-base pré-existe às migrations versionadas aqui),
-- não dá pra confirmar com certeza se a linha nasce por trigger de banco
-- no INSERT de quotes ou por código de aplicação fora do que foi
-- encontrado. Na prática isso não muda a correção deste backfill: o
-- Passo 2 casa por negotiations.quote_id = quotes.id de qualquer forma,
-- então funciona igual independente da origem da linha.
