-- ============================================================================
-- Pagos extra por alumna: Uniforme ($1,500) y Certificado ($7,000)
-- Ejecutar UNA VEZ en: Supabase → SQL Editor → Run
-- Una fila por (alumna, concepto) con el monto ACUMULADO pagado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pagos_extras (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alumna_id   uuid NOT NULL REFERENCES alumnas(id) ON DELETE CASCADE,
  concepto    text NOT NULL,                 -- 'uniforme' | 'certificado'
  monto       numeric NOT NULL DEFAULT 0,    -- acumulado pagado
  estado      text NOT NULL DEFAULT 'pendiente', -- pagado | parcial | pendiente
  fecha_pago  date,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (alumna_id, concepto)
);

ALTER TABLE pagos_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_own ON pagos_extras;
CREATE POLICY users_own ON pagos_extras
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_pagos_extras_alumna ON pagos_extras(alumna_id);
