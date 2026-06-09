-- Create shipments table for order fulfillment/expedição
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,

  -- Tipos de entrega
  delivery_type VARCHAR(20) CHECK (delivery_type IN ('delivery', 'pickup')),

  -- Datas
  delivery_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status de separação
  separation_status VARCHAR(50) CHECK (separation_status IN (
    'queued', 'in_progress', 'completed', 'awaiting_material'
  )) DEFAULT 'queued',

  -- Prioridade
  priority VARCHAR(20) CHECK (priority IN ('low', 'mid', 'high')) DEFAULT 'mid',

  -- Finalização
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,

  -- Arquivos (JSON array de URLs ou nomes de files)
  material_files JSONB DEFAULT '[]'::jsonb,

  -- Auditoria
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_shipments_quote_id ON shipments(quote_id);
CREATE INDEX idx_shipments_status ON shipments(separation_status);
CREATE INDEX idx_shipments_delivery_type ON shipments(delivery_type);
CREATE INDEX idx_shipments_priority ON shipments(priority);
CREATE INDEX idx_shipments_is_completed ON shipments(is_completed);

-- Enable RLS
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: authenticated users can SELECT all shipments
CREATE POLICY shipments_select_auth ON shipments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policy: authenticated users can UPDATE all shipments
CREATE POLICY shipments_update_auth ON shipments
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- RLS Policy: no DELETE (only via cascade from quotes)
-- This prevents accidental deletion of shipment records
