-- Ejecutar esto en Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS transferencias_wallet (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,
  concepto    text NOT NULL,
  monto       numeric NOT NULL,           -- positivo = entrada, negativo = salida
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE transferencias_wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own ON transferencias_wallet;
CREATE POLICY users_own ON transferencias_wallet
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
