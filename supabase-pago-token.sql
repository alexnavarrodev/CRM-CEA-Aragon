-- ============================================================================
-- Paso 2 del módulo de pagos — Token de pago por alumna
-- Ejecutar UNA VEZ en: Supabase (proyecto de Florencia/Aragón) → SQL Editor → Run
-- Añade alumnas.pago_token (único). El DEFAULT genera un token aleatorio para
-- cada alumna existente y para las futuras automáticamente.
-- ============================================================================

-- 1. Columna con token aleatorio por defecto (rellena también las filas existentes)
ALTER TABLE alumnas
  ADD COLUMN IF NOT EXISTS pago_token text DEFAULT gen_random_uuid()::text;

-- 2. Backfill de seguridad por si alguna quedó sin token
UPDATE alumnas SET pago_token = gen_random_uuid()::text WHERE pago_token IS NULL;

-- 3. Hacerlo único (índice incluido). Si ya existe la constraint, ignora el error.
DO $$
BEGIN
  ALTER TABLE alumnas ADD CONSTRAINT alumnas_pago_token_key UNIQUE (pago_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Listo. Cada alumna tiene su /pagar/<pago_token>.
