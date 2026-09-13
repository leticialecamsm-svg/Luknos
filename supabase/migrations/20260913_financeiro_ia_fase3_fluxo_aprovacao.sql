-- Fase 3, item 10 (parte 1): fluxo de aprovação de lançamentos por valor de
-- corte. approval_settings.approval_threshold vigente = a linha mais recente;
-- threshold <= 0 (ou nenhuma linha) significa "sem aprovação configurada" —
-- nada entra em aguardando_aprovacao, como já era antes desta migration.

create or replace function public.current_approval_threshold()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select approval_threshold from public.approval_settings order by created_at desc limit 1),
    0
  );
$$;

revoke execute on function public.current_approval_threshold() from public;
grant execute on function public.current_approval_threshold() to authenticated;

create or replace function public.set_transaction_completeness()
returns trigger
language plpgsql
as $$
declare
  v_threshold numeric;
begin
  new.is_complete := (new.category_id is not null and new.cost_center_id is not null and new.bank_account_id is not null);

  if new.status not in ('pago', 'aprovado', 'rejeitado', 'aguardando_aprovacao') then
    if new.is_complete then
      new.status := 'pendente';
    else
      new.status := 'incompleto';
    end if;
  end if;

  if new.status = 'pendente' then
    v_threshold := public.current_approval_threshold();
    if v_threshold > 0 and new.amount > v_threshold then
      new.status := 'aguardando_aprovacao';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.approve_transaction(p_transaction_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  select * into v_transaction from public.transactions where id = p_transaction_id;
  if v_transaction is null then
    raise exception 'Lançamento não encontrado';
  end if;

  if not (public.is_gestor() or public.can_approve_flag()) then
    raise exception 'Sem permissão para aprovar lançamentos';
  end if;

  if v_transaction.status <> 'aguardando_aprovacao' then
    raise exception 'Lançamento não está aguardando aprovação';
  end if;

  update public.transactions
  set status = case when p_approved then 'aprovado' else 'rejeitado' end
  where id = p_transaction_id;
end;
$$;

revoke execute on function public.approve_transaction(uuid, boolean) from public;
grant execute on function public.approve_transaction(uuid, boolean) to authenticated;

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

  if v_transaction.status in ('aguardando_aprovacao', 'rejeitado') then
    raise exception 'Lançamento precisa ser aprovado antes de ser marcado como pago';
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

create or replace function public.get_cashflow_projection(start_date date, end_date date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_opening numeric;
  v_result json;
begin
  select coalesce(sum(current_balance), 0) into v_opening from public.bank_accounts;

  with days as (
    select generate_series(start_date, end_date, interval '1 day')::date as day
  ),
  agg as (
    select
      d.day,
      coalesce(sum(e.amount) filter (where e.direction = 'a_receber' and e.status not in ('pago', 'aguardando_aprovacao', 'rejeitado') and e.is_complete), 0) as expected_in,
      coalesce(sum(e.amount) filter (where e.direction = 'a_pagar' and e.status not in ('pago', 'aguardando_aprovacao', 'rejeitado') and e.is_complete), 0) as expected_out,
      coalesce(sum(e.amount) filter (where e.status = 'aguardando_aprovacao'), 0) as pending_approval
    from days d
    left join public.transaction_cash_events() e on e.due_date = d.day
    group by d.day
  ),
  running as (
    select
      day,
      expected_in,
      expected_out,
      pending_approval,
      v_opening + coalesce(sum(expected_in - expected_out) over (order by day rows between unbounded preceding and 1 preceding), 0) as opening_balance,
      v_opening + coalesce(sum(expected_in - expected_out) over (order by day rows between unbounded preceding and current row), 0) as closing_balance
    from agg
  )
  select json_agg(json_build_object(
    'date', day,
    'opening_balance', opening_balance,
    'expected_in', expected_in,
    'expected_out', expected_out,
    'pending_approval', pending_approval,
    'closing_balance', closing_balance
  ) order by day) into v_result
  from running;

  return v_result;
end;
$$;

create or replace function public.get_daily_cash_panel(target_date date default current_date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_consolidated numeric;
  v_due numeric;
  v_receivable numeric;
  v_items json;
begin
  select coalesce(sum(current_balance), 0) into v_consolidated from public.bank_accounts;

  select coalesce(sum(amount), 0) into v_due
  from public.transaction_cash_events()
  where direction = 'a_pagar' and due_date = target_date and status not in ('pago', 'aguardando_aprovacao', 'rejeitado');

  select coalesce(sum(amount), 0) into v_receivable
  from public.transaction_cash_events()
  where direction = 'a_receber' and due_date = target_date and status not in ('pago', 'aguardando_aprovacao', 'rejeitado');

  select coalesce(json_agg(json_build_object(
    'transaction_id', e.transaction_id,
    'direction', e.direction,
    'description', e.description,
    'amount', e.amount,
    'status', e.status,
    'category', c.name,
    'supplier', s.name,
    'cost_center', cc.name,
    'bank_account', ba.name
  ) order by e.direction, e.description), '[]'::json) into v_items
  from public.transaction_cash_events() e
  left join public.categories c on c.id = e.category_id
  left join public.suppliers s on s.id = e.supplier_id
  left join public.cost_centers cc on cc.id = e.cost_center_id
  left join public.bank_accounts ba on ba.id = e.bank_account_id
  where e.due_date = target_date;

  return json_build_object(
    'consolidated_balance', v_consolidated,
    'total_due_today', v_due,
    'total_receivable_today', v_receivable,
    'remaining', v_consolidated + v_receivable - v_due,
    'items', v_items
  );
end;
$$;

revoke execute on function public.mark_transaction_paid(uuid, date) from public;
grant execute on function public.mark_transaction_paid(uuid, date) to authenticated;
revoke execute on function public.get_cashflow_projection(date, date) from public;
grant execute on function public.get_cashflow_projection(date, date) to authenticated;
revoke execute on function public.get_daily_cash_panel(date) from public;
grant execute on function public.get_daily_cash_panel(date) to authenticated;
