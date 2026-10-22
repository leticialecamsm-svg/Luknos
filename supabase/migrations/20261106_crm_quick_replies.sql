-- Respostas rápidas do CRM (mensagens salvas, compartilhadas pela equipe).
create table if not exists public.crm_quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sort int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_quick_replies enable row level security;
-- acesso só pelo servidor (service role), como as demais tabelas do CRM

insert into public.crm_quick_replies (title, body, sort)
select * from (values
  ('Chave Pix', E'🔑*Chave Pix: CNPJ*\n\n45118870000106\n> *Luknos LTDA*\n> *Banco Bradesco S.A.*\n\n_Por gentileza, enviar o comprovante após a transferência_', 10),
  ('Pagamento recebido', E'> *A Luknos confirma o recebimento do pagamento* ✅\n\nSeu pedido está sendo separado conforme o combinado.\nEm breve retornaremos com a atualização de retirada/entrega.\n\n*Luknos Iluminação*\nA luz do futuro brilha aqui ✨', 20),
  ('Nosso endereço', E'*`NOSSO ENDEREÇO`*\n\n> Luknos Iluminação\n*Av. Menino Marcelo, 7737 - Serraria*\nLoja azul de esquina, em frente ao chalé suíço\n\nhttps://maps.app.goo.gl/mDaaEe9ksvKAofgy6?g_st=ic', 30),
  ('Avaliação no Google', E'Obrigada pela confiança! 💛\n\nSe puder, deixe sua avaliação da Luknos no Google — leva menos de um minuto e ajuda outras pessoas a nos encontrarem. ✨\n\nhttps://g.page/r/CavcMFfaO2QnEBM/review', 40)
) as v(title, body, sort)
where not exists (select 1 from public.crm_quick_replies);
