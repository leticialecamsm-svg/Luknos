-- Parceiro vinculado ao agendamento
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Horário deixa de ser obrigatório (agendamento exige só data)
ALTER TABLE schedules ALTER COLUMN scheduled_time DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_partner_id ON schedules(partner_id);
CREATE INDEX IF NOT EXISTS idx_schedules_quote_id ON schedules(quote_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(scheduled_date);
