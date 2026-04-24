CREATE TABLE IF NOT EXISTS fiscal_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(120) NOT NULL UNIQUE,
  "numeroNf" VARCHAR(60),
  cliente JSONB,
  pedido JSONB,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'pendente',
  "cancelReason" TEXT,
  "payloadJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "focusJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tipoDocumento" VARCHAR(10) NOT NULL CHECK ("tipoDocumento" IN ('nfe', 'nfse')),
  ambiente VARCHAR(20) NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  "createdEm" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedEm" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_notas_status ON fiscal_notas(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_notas_tipo_documento ON fiscal_notas("tipoDocumento");
CREATE INDEX IF NOT EXISTS idx_fiscal_notas_created_em ON fiscal_notas("createdEm");
