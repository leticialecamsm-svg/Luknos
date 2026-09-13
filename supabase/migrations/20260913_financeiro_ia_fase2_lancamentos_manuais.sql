-- Fase 2, item 6: lançamentos manuais (contas a pagar/receber), com regra de
-- completude, parcelamento e "marcar pago" atualizando o saldo real da conta.
-- Ver docs/FUNCTIONS.md do pacote: set_transaction_completeness() [EXTENSÃO],
-- create_transaction_with_installments(), mark_transaction_paid().
--
-- mark_transaction_paid precisa ser SECURITY DEFINER porque também atualiza
-- bank_accounts.current_balance, e a RLS de bank_accounts só libera update
-- pra is_gestor() -- um colaborador com can_approve=true precisa conseguir
-- marcar como pago sem ganhar acesso direto de escrita em bank_accounts.
--
-- A regra de aprovação por valor de corte (approval_threshold) e o fluxo de
-- aprovação em si ficam para a Fase 3 (item 10 do PLANO.md) -- aqui o status
-- só alterna entre incompleto/pendente/pago, sem fila de aprovação ainda.

create or replace function public.set_transaction_completeness()
returns trigger
language plpgsql
as $$
begin
  new.is_complete := (new.category_id is not null and new.cost_center_id is not null and new.bank_account_id is not null);
  if new.status not in ('pago') then
    if new.is_complete then
      if new.status = 'incompleto' then
        new.status := 'pendente';
      end if;
    else
      new.status := 'incompleto';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_transactions_completeness
before insert or update on public.transactions
for each row execute function public.set_transaction_completeness();

create or replace function public.create_transaction_with_installments(
  p_direction text,
  p_description text,
  p_amount numeric,
  p_due_date date,
  p_category_id uuid default null,
  p_supplier_id uuid default null,
  p_cost_center_id uuid default null,
  p_bank_account_id uuid default null,
  p_total_installments int default 1,
  p_recurrence_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_installment_amount numeric(14,2);
  v_last_amount numeric(14,2);
  v_i int;
begin
  if p_direction not in ('a_pagar', 'a_receber') then
    raise exception 'direction inválida: %', p_direction;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount precisa ser maior que zero';
  end if;
  if coalesce(p_total_installments, 1) < 1 then
    raise exception 'total_installments precisa ser >= 1';
  end if;

  insert into public.transactions (
    direction, description, amount, category_id, supplier_id, cost_center_id,
    bank_account_id, due_date, recurrence_id, created_by
  ) values (
    p_direction, p_description, p_amount, p_category_id, p_supplier_id, p_cost_center_id,
    p_bank_account_id, p_due_date, p_recurrence_id, auth.uid()
  )
  returning id into v_transaction_id;

  if coalesce(p_total_installments, 1) > 1 then
    v_installment_amount := trunc(p_amount / p_total_installments, 2);
    v_last_amount := p_amount - v_installment_amount * (p_total_installments - 1);
    for v_i in 1..p_total_installments loop
      insert into public.transaction_installments (
        transaction_id, installment_number, total_installments, amount, due_date
      ) values (
        v_transaction_id, v_i, p_total_installments,
        case when v_i = p_total_installments then v_last_amount else v_installment_amount end,
        p_due_date + ((v_i - 1) * interval '1 month')
      );
    end loop;
  end if;

  return v_transaction_id;
end;
$$;

revoke execute on function public.create_transaction_with_installments(text, text, numeric, date, uuid, uuid, uuid, uuid, int, uuid) from public;
grant execute on function public.create_transaction_with_installments(text, text, numeric, date, uuid, uuid, uuid, uuid, int, uuid) to authenticated;

create or replace function public.mark_transaction_paid(
  p_transaction_id uuid,
  p_paid_on date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_delta numeric(14,2);
begin
  select * into v_transaction from public.transactions where id = p_transaction_id;
  if v_transaction is null then
    raise exception 'Lançamento não encontrado';
  end if;

  if not (
    public.is_gestor()
    or public.can_approve_flag()
    or v_transaction.created_by = auth.uid()
  ) then
    raise exception 'Sem permissão para marcar este lançamento como pago';
  end if;

  if v_transaction.status = 'pago' then
    return;
  end if;

  update public.transactions
  set status = 'pago', paid_date = p_paid_on
  where id = p_transaction_id;

  if v_transaction.bank_account_id is not null then
    v_delta := case when v_transaction.direction = 'a_receber' then v_transaction.amount else -v_transaction.amount end;
    update public.bank_accounts
    set current_balance = current_balance + v_delta
    where id = v_transaction.bank_account_id;
  end if;
end;
$$;

revoke execute on function public.mark_transaction_paid(uuid, date) from public;
grant execute on function public.mark_transaction_paid(uuid, date) to authenticated;
