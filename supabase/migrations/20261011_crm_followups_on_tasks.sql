-- Follow-up de uma conversa do CRM = uma tarefa (Tarefas e Agenda) ligada à conversa.
-- title: "Follow-up: <contato>"; description: o que falar; due_date: quando; user_id: responsável.
alter table public.tasks
  add column if not exists crm_conversation_id uuid references public.crm_conversations(id) on delete cascade;
create index if not exists tasks_crm_conversation_idx on public.tasks (crm_conversation_id) where crm_conversation_id is not null;
