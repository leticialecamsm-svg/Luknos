-- Registro de atividade da equipe (só admin vê, pela tela /admin/atividade).
--
-- audit_log: toda criação/edição/exclusão feita por uma PESSOA nas tabelas de negócio.
-- Quem fez: auth.uid() (cliente com a sessão do usuário) ou o cabeçalho x-actor-id que o
-- createAdminClient manda quando roda dentro de uma requisição de usuário. Escritas sem
-- pessoa por trás (webhook, robô, crons) não entram — só barulho para esta finalidade.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid not null,
  table_name text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  row_id text,
  label text,
  changes jsonb
);
create index if not exists audit_log_actor_at on public.audit_log (actor_id, at desc);
create index if not exists audit_log_at on public.audit_log (at desc);
alter table public.audit_log enable row level security;

-- Aberturas de conversa no CRM (a tabela de leitura guarda só a última).
create table if not exists public.crm_conversation_opens (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists crm_conversation_opens_user_at on public.crm_conversation_opens (user_id, at desc);
create index if not exists crm_conversation_opens_conv_at on public.crm_conversation_opens (conversation_id, at desc);
alter table public.crm_conversation_opens enable row level security;

create or replace function public.audit_actor() returns uuid
language plpgsql stable as $$
declare
  h text;
begin
  if auth.uid() is not null then return auth.uid(); end if;
  begin
    h := current_setting('request.headers', true)::json ->> 'x-actor-id';
  exception when others then
    return null;
  end;
  if h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return h::uuid; end if;
  return null;
end $$;

-- Valores longos (textos, listas) viram um resumo para o registro não pesar.
create or replace function public.audit_short(v jsonb) returns jsonb
language sql immutable as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 300 then to_jsonb(left(v #>> '{}', 300) || '…')
    when jsonb_typeof(v) in ('object', 'array') and length(v::text) > 300 then to_jsonb(left(v::text, 300) || '…')
    else v
  end
$$;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := public.audit_actor();
  o jsonb;
  n jsonb;
  r jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
  -- colunas que mudam sozinhas ou não dizem nada sobre o trabalho de alguém
  ignored text[] := array['updated_at', 'created_at', 'last_message_at', 'contact_photo_url', 'contact_photo_checked_at',
    'contact_name_cache', 'temperature_updated_at', 'last_auto_demoted_at', 'sort_order'];
begin
  if actor is null then return null; end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k = any(ignored) then continue; end if;
      if (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(public.audit_short(o -> k), public.audit_short(n -> k)));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  else
    for k in select jsonb_object_keys(r) loop
      if k = any(ignored) or (r -> k) = 'null'::jsonb then continue; end if;
      diff := diff || jsonb_build_object(k, public.audit_short(r -> k));
    end loop;
  end if;

  insert into public.audit_log (actor_id, table_name, op, row_id, label, changes)
  values (
    actor, tg_table_name, lower(tg_op), r ->> 'id',
    left(coalesce(r ->> 'name', r ->> 'title', r ->> 'client_name', r ->> 'label', r ->> 'description', r ->> 'number', r ->> 'notes'), 140),
    diff
  );
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts', 'users', 'roles',
    'crm_conversations', 'crm_conversation_labels', 'crm_labels', 'crm_stages', 'crm_quick_replies',
    'crm_solicitation_links', 'crm_instances', 'crm_instance_members', 'crm_conversation_access',
    'solicitations', 'solicitation_stage_links', 'solicitation_stage_responsibles',
    'quotes', 'quote_owners', 'quote_proposals', 'quote_attachments', 'quote_partners', 'negotiations', 'commissions',
    'tasks', 'subtasks', 'schedules', 'visits', 'shipments', 'installation_trackings', 'post_sale_followups',
    'purchase_invoices', 'purchase_checklist_items',
    'finance_accounts', 'finance_categories', 'finance_entries', 'finance_suppliers', 'bank_accounts',
    'transactions', 'transaction_installments', 'payroll_data', 'payment_method_rates', 'monthly_goals',
    'fiscal_documents', 'pricing_quotes', 'pricing_suppliers', 'pricing_product_types', 'product_proposals',
    'design_projects', 'project_plans', 'marketing_posts', 'metropolitano_launches', 'site_brands', 'site_leads',
    'policy_documents', 'policy_assignments', 'training_tracks', 'training_modules', 'training_lessons', 'wa_bot_config'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists audit_row_change on public.%I', t);
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;
