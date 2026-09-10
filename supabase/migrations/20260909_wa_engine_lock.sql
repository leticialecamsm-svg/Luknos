-- Lock de execução do bot-conversation-engine: serializa o processamento de
-- mensagens da mesma conversa (uma rajada de arquivos no 1º contato disparava
-- N execuções concorrentes que mandavam as mesmas perguntas repetidas).
alter table public.wa_conversations add column if not exists engine_lock_until timestamptz;
comment on column public.wa_conversations.engine_lock_until is 'Lock de execução do bot-conversation-engine — evita processamento concorrente de mensagens em rajada.';
