-- Proposta de valor: uma proposta pode ter vários PDFs; o valor da proposta é a SOMA.
-- E o "valor orçado" (quotes.quoted_value) deixa de ser um campo próprio escondido:
-- passa a espelhar a Proposta 01 (a primeira cadastrada em Proposta de valor).

-- 1) Arquivos (PDFs) de cada proposta, cada um com seu valor
create table if not exists quote_proposal_files (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references quote_proposals(id) on delete cascade,
  attachment_id uuid references quote_attachments(id) on delete cascade,
  file_name text not null,
  value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_qpf_proposal on quote_proposal_files(proposal_id);
create index if not exists idx_qpf_attachment on quote_proposal_files(attachment_id);
alter table quote_proposal_files enable row level security;
drop policy if exists "allow_all_authenticated" on quote_proposal_files;
create policy "allow_all_authenticated" on quote_proposal_files for all to authenticated using (true) with check (true);

-- 2) Migra o valor orçado antigo para uma proposta (será a Proposta 01 = a mais antiga).
--    Só cria se ainda não existe uma proposta com esse mesmo valor.
insert into quote_proposals (quote_id, value, date, info, created_at)
select q.id, q.quoted_value, coalesce(q.quote_date, q.created_at::date),
       'Valor orçado (migrado do cadastro antigo)',
       least(q.created_at, coalesce((select min(p.created_at) from quote_proposals p where p.quote_id = q.id), q.created_at) - interval '1 second')
from quotes q
where q.quoted_value > 0
  and not exists (select 1 from quote_proposals p where p.quote_id = q.id and p.value = q.quoted_value);

-- 3) Valor da proposta = soma dos valores dos seus arquivos (quando ela tem arquivos)
create or replace function qpf_recalc() returns trigger language plpgsql as $$
declare pid uuid := coalesce(new.proposal_id, old.proposal_id);
begin
  update quote_proposals
     set value = (select coalesce(sum(f.value), 0) from quote_proposal_files f where f.proposal_id = pid)
   where id = pid and exists (select 1 from quote_proposal_files f where f.proposal_id = pid);
  return null;
end $$;
drop trigger if exists trg_qpf_recalc on quote_proposal_files;
create trigger trg_qpf_recalc after insert or update of value or delete on quote_proposal_files
  for each row execute function qpf_recalc();

-- 4) quotes.quoted_value espelha a primeira proposta cadastrada
create or replace function qp_sync_quoted() returns trigger language plpgsql as $$
declare qid uuid := coalesce(new.quote_id, old.quote_id);
begin
  update quotes
     set quoted_value = (select p.value from quote_proposals p where p.quote_id = qid order by p.created_at asc, p.id asc limit 1)
   where id = qid;
  return null;
end $$;
drop trigger if exists trg_qp_sync_quoted on quote_proposals;
create trigger trg_qp_sync_quoted after insert or update of value, created_at or delete on quote_proposals
  for each row execute function qp_sync_quoted();
