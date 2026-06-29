CREATE TABLE IF NOT EXISTS finance_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  supply_area TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES finance_suppliers(id) ON DELETE SET NULL;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL;

ALTER TABLE finance_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can manage suppliers" ON finance_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth users can manage categories" ON finance_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
