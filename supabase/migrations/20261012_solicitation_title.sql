-- Título opcional para a Solicitação (ex.: "Reforma Apê 708 - Iluminação").
-- Nullable: solicitações antigas seguem usando o nome do cliente.
alter table solicitations add column if not exists title text;
