# Luknos — Guia de Deploy
## Do zero ao ar em ~30 minutos

---

## PASSO 1 — Criar conta no Supabase (5 min)

1. Acesse **supabase.com** → "Start your project"
2. Crie conta com GitHub ou email
3. Clique em **"New project"**
4. Preencha:
   - **Name:** luknos
   - **Database Password:** (Jpl282706!Luk)anote esta senha em lugar seguro
   - **Region:** South America (São Paulo)
5. Aguarde ~2 minutos para o projeto ser criado

---

## PASSO 2 — Rodar o schema no banco (5 min)

1. No painel do Supabase, clique em **SQL Editor** (ícone de banco na barra lateral)
2. Clique em **"New query"**
3. Abra o arquivo `luknos_schema.sql` que você recebeu
4. Cole todo o conteúdo no editor
5. Clique em **"Run"** (ou Ctrl+Enter)
6. Você deve ver: *"Success. No rows returned"*

---

## PASSO 3 — Pegar as chaves do Supabase (2 min)

1. No painel do Supabase: **Settings → API**
2. Copie:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`

https://dpobbflxgrjbfpxmtehg.supabase.co

   - **anon public** key → string longa começando com `eyJ...`
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwb2JiZmx4Z3JqYmZweG10ZWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODcwNzgsImV4cCI6MjA5NjM2MzA3OH0.FXcG_C_yvVl6_gjSaK1zFRItQ8OcyMmQDDgIFCBDFKM

---

## PASSO 4 — Configurar o projeto localmente (5 min)

```bash
# Na pasta do projeto:
cp .env.example .env.local
```

Abra `.env.local` e preencha com os valores do Passo 3:
```
NEXT_PUBLIC_SUPABASE_URL=https://dpobbflxgrjbfpxmtehg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwb2JiZmx4Z3JqYmZweG10ZWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODcwNzgsImV4cCI6MjA5NjM2MzA3OH0.FXcG_C_yvVl6_gjSaK1zFRItQ8OcyMmQDDgIFCBDFKM
```

Instale as dependências:
```bash
npm install
```

Teste local:
```bash
npm run dev
```

Abra **http://localhost:3000** — deve aparecer a tela de login.

---

## PASSO 5 — Criar os usuários (5 min)

No Supabase, vá em **Authentication → Users → "Add user"**

Crie um usuário para você primeiro:
- Email: seu email
- Password: sua senha
- Clique em "Create user"

Depois de criar, rode no SQL Editor para tornar admin:
```sql
UPDATE public.users 
SET role = 'admin', name = 'Letícia'
WHERE email = 'seu@email.com';
```

Faça o mesmo para o João:
```sql
UPDATE public.users 
SET role = 'admin', name = 'João'
WHERE email = 'email-do-joao@exemplo.com';
```

Os outros colaboradores (Jennifer, Dálisson, Isabelle) você cria pelo painel
de **Administração** dentro do próprio sistema depois de fazer login.

---

## PASSO 6 — Subir no GitHub (3 min)

```bash
# Na pasta do projeto:
git init
git add .
git commit -m "feat: luknos mvp inicial"
```

1. Acesse **github.com** → botão **"+"** → "New repository"
2. Nome: `luknos`
3. Visibilidade: **Private** (importante!)
4. NÃO inicialize com README
5. Copie os comandos que o GitHub mostra e execute:

```bash
git remote add origin https://github.com/SEU_USUARIO/luknos.git
git branch -M main
git push -u origin main
```

---

## PASSO 7 — Deploy na Vercel (5 min)

1. Acesse **vercel.com** → "Sign up with GitHub"
2. Clique em **"Add New Project"**
3. Importe o repositório `luknos`
4. Na tela de configuração, adicione as **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` → o valor do Passo 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → o valor do Passo 3
5. Clique em **"Deploy"**
6. Aguarde ~2 minutos

Pronto! A Vercel vai te dar uma URL como:
**https://luknos.vercel.app**

---

## PASSO 8 — Configurar URL no Supabase (2 min)

Para o login funcionar na URL de produção:

1. Supabase → **Authentication → URL Configuration**
2. Em **"Site URL"**: coloque `https://luknos.vercel.app`
3. Em **"Redirect URLs"**: adicione `https://luknos.vercel.app/auth/callback`
4. Salve

---

## PASSO 9 — Domínio próprio (opcional, 5 min)

Se quiser usar `sistema.luknos.com.br` ou similar:

1. Na Vercel: **Settings → Domains → "Add"**
2. Digite o domínio desejado
3. A Vercel vai mostrar os registros DNS para configurar no seu provedor
4. Atualize o Site URL no Supabase com o novo domínio

---

## Metas iniciais — configurar depois do login

Após fazer login como admin, vá em **Administração** e configure as metas mensais.

Ou rode diretamente no SQL Editor (substitua os UUIDs pelos IDs reais dos usuários):

```sql
-- Ver os IDs dos usuários criados:
SELECT id, name, email FROM public.users;

-- Inserir metas de junho/2026:
INSERT INTO public.monthly_goals (user_id, year, month, target) VALUES
  (null, 2026, 6, 140000),  -- meta da loja
  ('<uuid-jennifer>',  2026, 6, 70000),
  ('<uuid-dalisson>',  2026, 6, 70000),
  ('<uuid-joao>',      2026, 6, 70000),
  ('<uuid-leticia>',   2026, 6, 70000),
  ('<uuid-isabelle>',  2026, 6, 70000);
```

---

## Resumo dos comandos principais

| Ação | Comando |
|------|---------|
| Rodar local | `npm run dev` |
| Build de produção | `npm run build` |
| Deploy (automático) | `git push` — a Vercel faz deploy automático a cada push |

---

## Em caso de problemas

- **Erro de CORS:** verifique as URLs no Supabase Authentication → URL Configuration
- **#NAME? ou fórmulas erradas:** não se aplica — sistema não usa planilha :)
- **Usuário não consegue logar:** verifique se o email foi confirmado em Auth → Users
- **Dashboard vazio:** verifique se o schema foi rodado corretamente (Passo 2)

---

## Próximas features (v2)

- [ ] Módulo de Expedição e Compras
- [ ] Relatório de comissões com percentuais
- [ ] Notificações por email (prazo vencendo)
- [ ] Histórico mensal comparativo
- [ ] Export PDF de orçamento para cliente
- [ ] App mobile (PWA — funciona no celular sem instalar)
