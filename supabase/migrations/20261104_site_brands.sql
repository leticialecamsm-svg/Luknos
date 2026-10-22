-- Marcas da aba "Especificadores" do site (luknosiluminacao.com.br/especificadores).
-- Gerenciadas em /site-admin no sistema; o site só lê as visíveis.
CREATE TABLE IF NOT EXISTS site_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  logo_path text,                 -- caminho no bucket 'site' quando a logo foi enviada pelo sistema
  is_decorative boolean NOT NULL DEFAULT false,
  is_technical boolean NOT NULL DEFAULT false,
  -- [{ label, url, path? }] — path preenchido quando o PDF foi enviado pelo sistema
  catalogs jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocks_url text,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_brands_order ON site_brands(sort_order, name);

ALTER TABLE site_brands ENABLE ROW LEVEL SECURITY;
-- site público (chave anon): só as marcas visíveis
CREATE POLICY site_brands_public_read ON site_brands
  FOR SELECT TO anon USING (visible);
CREATE POLICY site_brands_all_auth ON site_brands
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket público com logos e catálogos em PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('site', 'site', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY site_bucket_auth_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site');
CREATE POLICY site_bucket_auth_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'site');
CREATE POLICY site_bucket_auth_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site');
