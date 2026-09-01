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
> - demais funções — scaffold (`501 not_implemented`), entram nas Fases 2 e 3.

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
