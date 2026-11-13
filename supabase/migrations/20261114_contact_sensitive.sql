-- Dados de cadastro do parceiro (CPF, PIX, nascimento, endereço).
-- Ficam numa tabela à parte, sem nenhuma policy: só o servidor (service role) lê e grava, e as telas
-- mostram apenas para administradores e para o responsável pelo parceiro. Assim, o select de
-- "contacts" que várias telas fazem nunca traz esses dados junto.
create table if not exists contact_sensitive (
  contact_id uuid primary key references contacts(id) on delete cascade,
  cpf        text,
  pix_key    text,
  birth_date date,
  address    text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

alter table contact_sensitive enable row level security;
revoke all on contact_sensitive from anon, authenticated;
