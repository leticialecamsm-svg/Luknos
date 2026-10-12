-- Mensagens editadas pelo CRM (WhatsApp permite até 15 min após o envio).
alter table public.crm_messages add column if not exists edited_at timestamptz;
