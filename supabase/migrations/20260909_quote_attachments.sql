-- Anexos de orçamento enviados manualmente pelo painel (criação / edição /
-- detalhe). Os arquivos que chegam pelo Robô WhatsApp continuam em
-- wa_attachments (bucket wa-attachments), vinculados por system_quote_id, e são
-- apenas listados junto — não migram pra cá.

create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists quote_attachments_quote_id_idx on public.quote_attachments(quote_id);

alter table public.quote_attachments enable row level security;
drop policy if exists quote_attachments_all_auth on public.quote_attachments;
create policy quote_attachments_all_auth on public.quote_attachments
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('quote-attachments', 'quote-attachments', false)
on conflict (id) do nothing;

comment on table public.quote_attachments is 'Arquivos anexados a um orçamento manualmente pelo painel. Robô WhatsApp -> wa_attachments.';
