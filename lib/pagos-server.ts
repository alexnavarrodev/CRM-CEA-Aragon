// lib/pagos-server.ts — Aplicar un pago (en línea) a una alumna, en el SERVIDOR.
// Reutiliza la lógica pura de lib/acumulacion.ts. Escribe en Supabase con el
// cliente admin (service_role) que se le pasa. No usar en el cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { planColegiatura, planBachillerato, mesToBachiTipo } from './acumulacion'

interface AlumnaPago {
  id: string
  user_id: string
  nombre: string
  programa: string
  cuota_mensual: number
}

/** Aplica `monto` (MXN) a la alumna: colegiatura / bachillerato / ambos (50-50),
 *  acumulando en los meses pendientes, e inserta el movimiento en caja. */
export async function aplicarPagoAlumna(
  supabase: SupabaseClient,
  alumna: AlumnaPago,
  monto: number,
  canal: string,         // 'transferencia' | 'tarjeta'
  fecha: string,         // 'YYYY-MM-DD'
) {
  const now = new Date(Date.now() - 6 * 3600 * 1000) // hora de México
  const anio = now.getUTCFullYear()
  const mes = now.getUTCMonth() + 1

  const esCol   = alumna.programa === 'colegiaturas' || alumna.programa === 'ambos'
  const esBachi = alumna.programa === 'bachillerato' || alumna.programa === 'ambos'
  const colLimit = alumna.programa === 'ambos' ? 1000 : (Number(alumna.cuota_mensual) || 1000)

  const aplicarCol = async (m: number) => {
    if (m <= 0) return
    const { data: existing } = await supabase
      .from('pagos_colegiaturas').select('id, anio, mes, monto, estado')
      .eq('alumna_id', alumna.id)
    const plan = planColegiatura(existing ?? [], m, anio, mes, colLimit)
    for (const w of plan) {
      if (w.id) {
        await supabase.from('pagos_colegiaturas')
          .update({ monto: w.monto, estado: w.estado, fecha_pago: fecha }).eq('id', w.id)
      } else {
        await supabase.from('pagos_colegiaturas').insert({
          user_id: alumna.user_id, alumna_id: alumna.id, anio: w.anio, mes: w.mes,
          monto: w.monto, estado: w.estado, fecha_pago: fecha,
        })
      }
    }
  }

  const aplicarBachi = async (m: number) => {
    if (m <= 0) return
    const { data: existing } = await supabase
      .from('pagos_bachillerato').select('id, anio, tipo, monto, estado')
      .eq('alumna_id', alumna.id)
    const plan = planBachillerato(existing ?? [], m, anio, mesToBachiTipo(mes), 1000)
    for (const w of plan) {
      if (w.id) {
        await supabase.from('pagos_bachillerato')
          .update({ monto: w.monto, estado: w.estado, fecha_pago: fecha }).eq('id', w.id)
      } else {
        await supabase.from('pagos_bachillerato').insert({
          user_id: alumna.user_id, alumna_id: alumna.id, anio: w.anio, tipo: w.tipo,
          monto: w.monto, estado: w.estado, fecha_pago: fecha,
        })
      }
    }
  }

  if (alumna.programa === 'ambos') {
    const mitad = monto / 2
    await aplicarCol(mitad)
    await aplicarBachi(mitad)
  } else if (esCol) {
    await aplicarCol(monto)
  } else if (esBachi) {
    await aplicarBachi(monto)
  }

  // Movimiento en caja (categoría 'ambos' para que el margen lo trate 50-50)
  const categoria = alumna.programa === 'ambos' ? 'ambos' : (esCol ? 'colegiatura' : 'bachillerato')
  await supabase.from('movimientos_caja').insert({
    user_id: alumna.user_id,
    tipo: 'ingreso',
    concepto: `Pago en línea — ${alumna.nombre}`,
    monto,
    canal,
    categoria,
    fecha,
    alumna_id: alumna.id,
  })
}
