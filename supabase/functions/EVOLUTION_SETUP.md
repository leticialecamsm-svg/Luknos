# Provisionamento da Evolution API — número dedicado do robô

> Modelo (fixo, do dossiê): **número dedicado**. A equipe encaminha os arquivos
> dos arquitetos para o WhatsApp do robô. Não migramos os números comerciais
> para API oficial.

Estas etapas envolvem **criar conta / contratar plano / subir servidor** — são
ações suas. Abaixo o passo a passo e tudo que já está pronto do lado do Supabase.

---

## 1. Escolher a hospedagem da Evolution

| Opção | Custo | Quando usar |
|---|---|---|
| **Evolution Cloud** | ~R$50/mês | Menos trabalho. Recomendado para começar. |
| **Self-hosted** (Docker) | Free + infra (VPS ~R$30/mês) | Se já houver VPS/servidor e vontade de manter. |

### Self-hosted (referência rápida)
```bash
docker run -d --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="<gere-uma-chave-forte>" \
  -e WEBHOOK_GLOBAL_ENABLED=false \
  atendai/evolution-api:latest
```
A `AUTHENTICATION_API_KEY` vira o `EVOLUTION_API_KEY`.

---

## 2. Criar a instância do robô

Nome sugerido: **`robo-orcamentos`** (use este valor também no `/bot-config`).

```bash
curl -X POST "$EVOLUTION_API_URL/instance/create" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "instanceName": "robo-orcamentos", "integration": "WHATSAPP-BAILEYS" }'
```

Depois **parear o número dedicado** lendo o QR Code:
```bash
curl "$EVOLUTION_API_URL/instance/connect/robo-orcamentos" -H "apikey: $EVOLUTION_API_KEY"
```

---

## 3. Apontar o webhook para a Edge Function

URL da função (projeto `dpobbflxgrjbfpxmtehg`):

```
https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/whatsapp-webhook
```

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/robo-orcamentos" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://dpobbflxgrjbfpxmtehg.supabase.co/functions/v1/whatsapp-webhook",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"],
      "headers": { "x-evolution-webhook-secret": "<EVOLUTION_WEBHOOK_SECRET>" }
    }
  }'
```

- `MESSAGES_UPSERT` cobre texto, documento, imagem e áudio recebidos.
- O header `x-evolution-webhook-secret` é validado dentro da função
  (`_shared/evolution.ts → verifyWebhookSecret`). Gere um segredo aleatório forte.
- A função está com `verify_jwt = false` em `supabase/config.toml` (a Evolution
  não tem JWT do Supabase) — a autenticação é o segredo acima + conferência do
  `instance`.

> A `whatsapp-webhook` hoje é stub (retorna `501`). A lógica entra na Fase 2.
> Você pode configurar o webhook agora; ele só vai processar mensagens quando a
> Fase 2 estiver deployada.

---

## 4. Guardar as credenciais (nunca em código)

### 4a. Secrets das Edge Functions (uso em runtime)
```bash
supabase secrets set \
  EVOLUTION_API_URL="https://sua-evolution" \
  EVOLUTION_API_KEY="<apikey>" \
  EVOLUTION_WEBHOOK_SECRET="<segredo-aleatorio>" \
  --project-ref dpobbflxgrjbfpxmtehg
```
(ou pelo painel: *Project Settings → Edge Functions → Secrets*.)

### 4b. Supabase Vault (registro/consulta administrativa)
A extensão `supabase_vault` já está habilitada. Para deixar as credenciais
versionadas de forma cifrada no banco:

```sql
select vault.create_secret('<apikey>',        'evolution_api_key',        'Evolution API - apikey global do robô');
select vault.create_secret('<segredo>',        'evolution_webhook_secret', 'Segredo do header x-evolution-webhook-secret');
select vault.create_secret('https://sua-evolution', 'evolution_api_url',   'Base URL da Evolution API');
```
Leitura (só service role): `select * from vault.decrypted_secrets where name like 'evolution_%';`

> `wa_bot_config.system_api_key_secret_ref` guarda apenas o **nome** do secret
> (ex.: `NEXTJS_API_KEY`), nunca o valor.

---

## 5. Salvar o nome da instância

Em **`/bot-config`** (painel), campo *Nome da instância* → `robo-orcamentos`.
Isso grava `wa_bot_config.evolution_instance_name`, lido por `whatsapp-webhook`
e `send-whatsapp-message`.

---

## Checklist

- [ ] Hospedagem escolhida (Cloud ou self-hosted)
- [ ] Instância `robo-orcamentos` criada e número pareado (QR)
- [ ] Webhook apontando para `.../functions/v1/whatsapp-webhook` com `MESSAGES_UPSERT`
- [ ] `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_WEBHOOK_SECRET` em `supabase secrets`
- [ ] Credenciais registradas no Vault
- [ ] `evolution_instance_name` salvo no `/bot-config`
