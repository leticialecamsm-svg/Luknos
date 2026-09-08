# Go-live — Robô de Orçamentos WhatsApp

Ordem exata. Tudo que precisa das suas credenciais está aqui — nada roda sozinho.

## 0. Pré-requisitos que você já tem
- VPS Hostinger com Evolution API v2.3.7 rodando (`http://evolution-api-yreg.srv1942891.hstgr.cloud`)
- Instância `robo-orcamentos` criada (status Desconectado)
- `EVOLUTION_API_KEY` (global), token da instância, senha root — guardados
- Chip do número do robô (do seu marido) em mãos

## 1. Gerar o segredo do webhook
```bash
openssl rand -hex 32
```
Guarde o resultado — vira `EVOLUTION_WEBHOOK_SECRET`.

## 2. API key da integração (Luknos <-> robô)
Gere uma string forte (`openssl rand -hex 32`). Ela vai nos DOIS lados com o mesmo valor:

**Vercel (projeto Luknos):** Settings -> Environment Variables
```
EXTERNAL_API_KEY = <a string>
```
Redeploy o Luknos depois de adicionar.

## 3. Secrets das Edge Functions (Supabase)
```bash
cd <repo luknos>
supabase login                       # abre o navegador
supabase link --project-ref dpobbflxgrjbfpxmtehg

supabase secrets set \
  EVOLUTION_API_URL="http://evolution-api-yreg.srv1942891.hstgr.cloud" \
  EVOLUTION_API_KEY="<sua apikey global da Evolution>" \
  EVOLUTION_WEBHOOK_SECRET="<passo 1>" \
  NEXTJS_API_URL="https://<dominio real do Luknos>" \
  NEXTJS_API_KEY="<mesma string do EXTERNAL_API_KEY, passo 2>"
```
> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no runtime — não precisa setar.

## 4. Deploy das Edge Functions
```bash
supabase functions deploy
```
Faz as 8 de uma vez, a partir dos arquivos em `supabase/functions/`. `verify_jwt` por função vem de `supabase/config.toml`.
(3 já estão no ar via MCP — este comando atualiza/canonicaliza todas.)

## 5. Ligar os crons de Edge Function
No SQL Editor do Supabase:
```sql
select vault.create_secret('<SUA_SERVICE_ROLE_KEY>', 'service_role_key',
  'pg_cron -> edge functions');
```
(Project Settings -> API -> service_role. A partir daqui `wa-notification-worker` e
`wa-retry-failed-submissions` passam a rodar de verdade.)

## 6. Deploy do painel
```bash
git add -A && git commit -m "feat: modulo Robo de Orcamentos WhatsApp"
git push
```
A Vercel faz o deploy. Confira em *Authentication -> URL Configuration* do Supabase
que `https://<dominio>/auth/callback` está nas Redirect URLs.

## 7. Configurar o robô no painel
- `/bot-config`: **Nome da instância** = `robo-orcamentos`; **Base URL** = domínio real
  do Luknos; **Ref. do segredo** = `NEXTJS_API_KEY`; confira origens/categorias.
- `/bot-collaborators`: cadastre cada pessoa da equipe que vai encaminhar projetos
  (telefone E.164 + vínculo ao vendedor do sistema).

## 8. Webhook na Evolution
```bash
curl -X POST "http://evolution-api-yreg.srv1942891.hstgr.cloud/webhook/set/robo-orcamentos" \
  -H "apikey: <EVOLUTION_API_KEY>" -H "Content-Type: application/json" \
  -d '{ "webhook": {
    "enabled": true,
    "url": "https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/whatsapp-webhook",
    "events": ["MESSAGES_UPSERT"],
    "headers": { "x-evolution-webhook-secret": "<passo 1>" }
  }}'
```

## 9. Parear o número
`http://evolution-api-yreg.srv1942891.hstgr.cloud/manager` -> instância `robo-orcamentos`
-> QR Code -> escaneie com o WhatsApp Business do número do robô (Aparelhos conectados).
Deixe o celular ligado/online na loja.

## 10. Teste ponta a ponta
1. De um número que está na whitelist, encaminhe um PDF de planta pro número do robô.
2. O robô responde e conduz: Cliente -> Origem -> Categoria -> Prioridade -> opcionais -> resumo.
3. Responda **sim**.
4. Verifique:
   - `/bot-conversations/[id]` -> status `submitted`, anexo aberto via signed URL, dados coletados
   - `/quotes` do Luknos -> o orçamento novo com status "Fila"
   - `/bot-notifications` -> notificação `sent` pro vendedor
   - o vendedor recebeu a mensagem no WhatsApp
5. Se falhar: `/bot-conversations/[id]` (admin) mostra o **Log de submissão** com o
   erro HTTP; corrija e use **Reprocessar**. Logs das functions:
   `supabase functions logs <nome> --project-ref dpobbflxgrjbfpxmtehg`.
