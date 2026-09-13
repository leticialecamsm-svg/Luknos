-- Luknos Financeiro Inteligente — Fase 2, item 7: integração nativa com as
-- vendas já registradas no Luknos.
--
-- Decisão da gestora (2026-09-13): "pode puxar de lá, evita duplicar" — em
-- vez de o vendedor redigitar a venda na tabela `sales` do pacote (como o
-- docs/ESTRUTURA.md original propunha), o financeiro sincroniza sozinho a
-- partir de `quotes`/`negotiations`, que já têm o fechamento completo
-- (valor final, forma de pagamento, parcelas em `payment_splits`).
--
-- Como funciona:
-- - `transactions.quote_id` liga o lançamento à venda de origem (índice
--   único parcial: no máximo 1 lançamento automático por venda).
-- - `sync_quote_receivable(quote_id)` monta o lançamento a_receber: 1 split
--   de pagamento = só o lançamento; 2+ splits = o lançamento + uma
--   `transaction_installments` por split (valor, data, pago/pendente vêm
--   direto do split). Venda que sai de "fechada" (reaberta/perdida) tem o
--   lançamento automático removido — nunca mexe num lançamento que a
--   gestora tenha editado manualmente (created_by is null = veio do sync).
-- - `is_complete` fica false de propósito: sem categoria/centro de
--   custo/conta bancária definidos, o lançamento não entra no DRE nem na
--   projeção até alguém classificar — regra de negócio de
--   docs/PROCESSO.md ("Regra: todo lançamento tem categoria [...] → sem
--   esses campos ele fica incompleto").
-- - Trigger em `negotiations` (insert/update de temperature, closed_at,
--   final_value, payment_splits, e delete) chama o sync sozinho — nenhum
--   colaborador precisa fazer nada no Financeiro quando fecha uma venda.
-- - Rodou o backfill de todas as vendas já fechadas no histórico (309
--   lançamentos, ~R$449.690) no momento da aplicação.
--
-- A função é SECURITY DEFINER com EXECUTE revogado de `public` — só roda
-- via trigger, não é uma RPC chamável direto pelo cliente.

alter table public.transactions
  add column quote_id uuid references public.quotes(id) on delete set null;
create unique index idx_transactions_quote_id on public.transactions (quote_id) where quote_id is not null;

create or replace function public.sync_quote_receivable(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg record;
  v_client text;
  v_number int;
  v_tx_id uuid;
  v_splits jsonb;
  v_n int;
  v_all_paid boolean;
  v_due date;
  v_paid_date date;
  v_status text;
  v_split jsonb;
  v_i int;
begin
  select n.temperature, n.closed_at, n.final_value, n.payment_splits
    into v_neg
    from public.negotiations n
    where n.quote_id = p_quote_id;

  if v_neg is null or v_neg.temperature is distinct from 'closed' then
    delete from public.transactions where quote_id = p_quote_id and created_by is null;
    return;
  end if;

  select q.number, q.client_name into v_number, v_client
    from public.quotes_full q where q.id = p_quote_id;

  v_splits := coalesce(v_neg.payment_splits, '[]'::jsonb);
  v_n := jsonb_array_length(v_splits);

  if v_n = 0 then
    v_due := v_neg.closed_at;
    v_paid_date := v_neg.closed_at;
    v_status := 'pago';
  else
    select bool_and(coalesce(s->>'status', 'paid') = 'paid') into v_all_paid
      from jsonb_array_elements(v_splits) s;
    select min(coalesce((s->>'date')::date, v_neg.closed_at)) into v_due
      from jsonb_array_elements(v_splits) s;
    v_status := case when v_all_paid then 'pago' else 'pendente' end;
    v_paid_date := case when v_all_paid then v_neg.closed_at else null end;
  end if;

  insert into public.transactions (
    quote_id, direction, description, amount, due_date, paid_date, status, is_complete, created_by
  ) values (
    p_quote_id, 'a_receber', 'Venda #' || v_number || coalesce(' — ' || v_client, ''),
    v_neg.final_value, v_due, v_paid_date, v_status, false, null
  )
  on conflict (quote_id) where quote_id is not null do update set
    description = excluded.description,
    amount = excluded.amount,
    due_date = excluded.due_date,
    paid_date = excluded.paid_date,
    status = excluded.status,
    updated_at = now()
  returning id into v_tx_id;

  delete from public.transaction_installments where transaction_id = v_tx_id;

  if v_n > 1 then
    v_i := 0;
    for v_split in select * from jsonb_array_elements(v_splits) loop
      v_i := v_i + 1;
      insert into public.transaction_installments (
        transaction_id, installment_number, total_installments, amount, due_date, status, paid_date
      ) values (
        v_tx_id, v_i, v_n,
        (v_split->>'amount')::numeric,
        coalesce((v_split->>'date')::date, v_neg.closed_at),
        case when coalesce(v_split->>'status','paid') = 'paid' then 'pago' else 'pendente' end,
        case when coalesce(v_split->>'status','paid') = 'paid' then coalesce((v_split->>'date')::date, v_neg.closed_at) else null end
      );
    end loop;
  end if;
end;
$$;
revoke execute on function public.sync_quote_receivable(uuid) from public;

create or replace function public.trg_sync_quote_receivable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_quote_receivable(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;

create trigger trg_negotiations_sync_receivable
  after insert or update of temperature, closed_at, final_value, payment_splits or delete
  on public.negotiations
  for each row execute function public.trg_sync_quote_receivable();

-- Backfill: sincroniza todo o histórico de vendas já fechadas.
do $$
declare v_id uuid;
begin
  for v_id in select quote_id from public.negotiations where temperature = 'closed' loop
    perform public.sync_quote_receivable(v_id);
  end loop;
end $$;
