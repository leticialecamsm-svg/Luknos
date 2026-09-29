-- Emissão fiscal (NF-e/NFC-e via Focus NFe). Linha única de configuração,
-- documentos emitidos e eventos (cancelamento etc). Sem RLS: só o servidor
-- (admin client) acessa, como os demais módulos administrativos.
create table public.fiscal_config (
  id boolean primary key default true, -- trava a tabela numa linha só
  cnpj text, ie text, crt smallint,
  ambiente text not null default 'homologacao', -- 'homologacao' | 'producao'
  focus_token_homologacao text, focus_token_producao text,
  nfe_serie_homologacao smallint default 1, nfe_serie_producao smallint default 2,
  nfce_serie_homologacao smallint default 1, nfce_serie_producao smallint default 2,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  constraint fiscal_config_singleton check (id)
);
insert into public.fiscal_config (id) values (true);
alter table public.fiscal_config enable row level security;

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tipo smallint not null, -- 55 = NF-e, 65 = NFC-e
  ambiente text not null,
  ref text not null unique, -- referência enviada à Focus (idempotência)
  quote_id uuid references public.quotes(id),
  status text not null default 'processando', -- processando | autorizado | erro_autorizacao | cancelado | erro_cancelamento
  numero text, serie text, chave_nfe text,
  protocolo text, mensagem_sefaz text,
  xml_url text, pdf_url text, qrcode_url text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_fiscal_documents_ref on public.fiscal_documents(ref);
create index idx_fiscal_documents_quote on public.fiscal_documents(quote_id);
alter table public.fiscal_documents enable row level security;

create table public.fiscal_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  tipo text not null, -- cancelamento | carta_correcao | inutilizacao
  justificativa text, protocolo text, status text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index idx_fiscal_events_document on public.fiscal_events(document_id);
alter table public.fiscal_events enable row level security;
