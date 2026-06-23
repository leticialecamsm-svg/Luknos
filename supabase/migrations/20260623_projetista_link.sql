-- Vincula um parceiro (ex.: projetista) a um colaborador/usuário vendedor.
-- Quando vinculado, o sistema soma na comissão do colaborador:
--   1% das vendas que ELE fechou (como vendedor) + 5% (a taxa do parceiro) das vendas em que ele foi o projetista.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_linked_user ON contacts(linked_user_id);
