# Edge Functions — Robô de Orçamentos WhatsApp

Módulo isolado dentro do projeto Supabase do Luknos. Nada aqui escreve direto nas
tabelas de negócio (`quotes`, `contacts`, `proposals`, `users`) — a gravação de
orçamento passa **exclusivamente** por `POST /api/external/quotes` do Next.js
(ver `_shared/system-api.ts`).

## Pastas

| Função | Auth | Disparada por | Fase |
|---|---|---|---|
| `whatsapp-webhook` | segredo do webhook | Evolution API | 2 |
| `bot-conversation-engine` | service role | `whatsapp-webhook` | 2 |
| `resolve-contact` | service role | `bot-conversation-engine` | 2 |
| `submit-quote` | service role | `bot-conversation-engine` | 2 |
| `send-whatsapp-message` | service role | engine / worker | 2 |
| `notification-worker` | service role | Cron 1 min / pós-submit | 2–3 |
| `retry-failed-submissions` | service role | Cron 15 min | 3 |
| `generate-attachment-signed-url` | Supabase Auth (staff/admin) | painel admin | 3 |

`_shared/` — helpers comuns: `env.ts`, `cors.ts`, `supabase.ts`, `evolution.ts`,
`system-api.ts`.

> **Status atual (Fase 2 em andamento):**
> - `whatsapp-webhook` — ✅ implementada
> - `bot-conversation-engine` — ✅ implementada (máquina de estados do cadastro guiado)
> - `send-whatsapp-message` — ✅ implementada
> - `resolve-contact` — ✅ implementada (chama `GET /api/external/contacts`)
> - `submit-quote` — ✅ implementada (POST `/api/external/quotes`, log, notificação)
> - `notification-worker` — ✅ implementada (fila wa_notifications; cron 1 min + pós-submit)
> - `retry-failed-submissions` — ✅ implementada (cron 15 min; teto 5 tentativas)
> - `generate-attachment-signed-url` — ✅ implementada (verify_jwt=true; signed URL 5 min)
>
> RPCs (migração `20260908_wa_robot_crons.sql`, aplicada): `fn_expire_stale_conversations()`,
> `fn_get_bot_stats(range)`, `wa_invoke_edge()`. Crons pg_cron: `wa-notification-worker` (1min),
> `wa-retry-failed-submissions` (15min), `wa-expire-stale-conversations` (30min).
> Os 2 crons de Edge Function ficam **inertes** até existir o Vault secret `service_role_key`.
>
> Endpoints no Next.js (auth por `EXTERNAL_API_KEY`):
> - `src/app/api/external/contacts/route.ts` — busca de contatos
> - `src/app/api/external/quotes/route.ts` — gravação de orçamento (mapeia labels
>   PT -> enums, cria contato se preciso, Proposta 1, atividade, status 'queue')
>
> Painel (`src/app/(bot)/`, guard `requireBotAccess`): `/bot-config`, `/bot-collaborators`,
> `/bot-conversations`, `/bot-conversations/[id]`, `/bot-dashboard`, `/bot-notifications`.

## Variáveis de ambiente

Ver `.env.example`. Para desenvolvimento local:

```bash
cp supabase/functions/.env.example supabase/functions/.env
# preencha os valores, então:
supabase functions serve --env-file supabase/functions/.env
```

Para produção (secrets do projeto):

```bash
supabase secrets set --env-file supabase/functions/.env
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no runtime deployado —
só precisam ser definidas para o `serve` local.

## Deploy

```bash
supabase link --project-ref dpobbflxgrjbfpxmtehg   # uma vez
supabase functions deploy whatsapp-webhook          # por função
```

`verify_jwt` por função está em `supabase/config.toml`.
