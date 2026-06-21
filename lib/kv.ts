// Almacén clave/valor por usuario (tabla `app_kv`, RLS por user_id).
//
// Reemplaza el uso de `auth user_metadata` para datos que crecen (transferencias
// `wallet_entries`, calendario `payment_calendars_v2`). Guardarlos en el metadata
// los metía en el JWT de sesión, inflaba la cookie y el CDN devolvía HTTP 400
// ("Bad Request") en dispositivos con sesión iniciada. Aquí viven en una tabla.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function kvGet<T>(supabase: SupabaseClient, key: string): Promise<T | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('app_kv').select('value').eq('user_id', user.id).eq('key', key).maybeSingle()
  return (data?.value ?? null) as T | null
}

export async function kvSet<T>(supabase: SupabaseClient, key: string, value: T): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('app_kv').upsert(
    { user_id: user.id, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' },
  )
}
