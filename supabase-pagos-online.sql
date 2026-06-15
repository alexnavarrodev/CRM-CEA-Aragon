-- ============================================================================
-- Paso 3 del módulo de pagos — Registro de pagos en línea (idempotencia)
-- Ejecutar UNA VEZ en: Supabase (Florencia/Aragón) → SQL Editor → Run
-- Evita que un mismo pago de Mercado Pago se aplique dos veces si el webhook
-- llega repetido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pagos_online (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL,
  alumna_id      uuid REFERENCES alumnas(id) ON DELETE SET NULL,
  mp_payment_id  text NOT NULL UNIQUE,         -- id del pago en Mercado Pago
  monto          numeric NOT NULL DEFAULT 0,
  estado         text NOT NULL DEFAULT 'approved',
  canal          text,                          -- transferencia | tarjeta
  raw            jsonb,                          -- respuesta cruda de MP (auditoría)
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE pagos_online ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own ON pagos_online;
CREATE POLICY users_own ON pagos_online
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Listo. El webhook escribe con service_role (omite RLS) y guarda mp_payment_id único.
