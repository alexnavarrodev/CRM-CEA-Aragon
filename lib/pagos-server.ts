// lib/pagos-server.ts — Aplicar un pago (en línea) a una alumna, en el SERVIDOR.
// Reutiliza la lógica pura de lib/acumulacion.ts. Escribe en Supabase con el
// cliente admin (service_role) que se le pasa. No usar en el cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planColegiatura, planBachillerato, mesToBachiTipo,
  mesesAdeudadosCol, mesesAdeudadosBachi, aplicaDescuentoProntoPago, PRONTO_PAGO_MONTO,
} from './acumulacion'
import { EXTRA_TARGET, EXTRA_LABEL } from './extras'

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
  const diaHoy = now.getUTCDate()

  const esCol   = alumna.programa === 'colegiaturas' || alumna.programa === 'ambos'
  const esBachi = alumna.programa === 'bachillerato' || alumna.programa === 'ambos'
  const colLimit = alumna.programa === 'ambos' ? 1000 : (Number(alumna.cuota_mensual) || 1000)

  // Prefetch + descuento pronto pago (solo sobre colegiatura)
  let colExisting: { id: string; anio: number; mes: number; monto: number; estado: string }[] = []
  let bachiExisting: { id: string; anio: number; tipo: string; monto: number; estado: string }[] = []
  let desc = 0
  if (esCol) {
    const { data } = await supabase.from('pagos_colegiaturas')
      .select('id, anio, mes, monto, estado').eq('alumna_id', alumna.id)
    colExisting = data ?? []
    const adeudoCol = mesesAdeudadosCol(colExisting, colLimit, anio, mes)
    desc = aplicaDescuentoProntoPago(alumna.programa, diaHoy, adeudoCol, anio, mes, colLimit) ? PRONTO_PAGO_MONTO : 0
  }
  if (esBachi) {
    const { data } = await supabase.from('pagos_bachillerato')
      .select('id, anio, tipo, monto, estado').eq('alumna_id', alumna.id)
    bachiExisting = data ?? []
  }

  const aplicarCol = async (m: number) => {
    if (m <= 0) return
    const plan = planColegiatura(colExisting, m, anio, mes, colLimit)
    for (const w of plan) {
      let estado = w.estado
      let montoW = w.monto
      // Descuento: completar el mes actual y mostrarlo como cuota completa
      if (desc > 0 && w.anio === anio && w.mes === mes && estado === 'parcial'
          && (colLimit - w.monto) <= desc) {
        estado = 'pagado'
        montoW = colLimit
      }
      if (w.id) {
        await supabase.from('pagos_colegiaturas')
          .update({ monto: montoW, estado, fecha_pago: fecha }).eq('id', w.id)
      } else {
        await supabase.from('pagos_colegiaturas').insert({
          user_id: alumna.user_id, alumna_id: alumna.id, anio: w.anio, mes: w.mes,
          monto: montoW, estado, fecha_pago: fecha,
        })
      }
    }
  }

  const aplicarBachi = async (m: number) => {
    if (m <= 0) return
    const plan = planBachillerato(bachiExisting, m, anio, mesToBachiTipo(mes), 1000)
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
    if (desc > 0) {
      // Descuento solo a colegiatura: bachillerato completo, colegiatura el resto (col - $50)
      const bachiOwed = mesesAdeudadosBachi(bachiExisting, 1000, anio, mesToBachiTipo(mes)).reduce((s, x) => s + x.falta, 0)
      await aplicarCol(monto - bachiOwed)
      await aplicarBachi(bachiOwed)
    } else {
      const mitad = monto / 2
      await aplicarCol(mitad)
      await aplicarBachi(mitad)
    }
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

  return { categoria }
}

/** Aplica un pago de Uniforme o Certificado: acumula en pagos_extras (tope en target)
 *  e inserta el movimiento en caja con esa categoría. */
export async function aplicarPagoExtra(
  supabase: SupabaseClient,
  alumna: AlumnaPago,
  concepto: 'uniforme' | 'certificado',
  monto: number,
  canal: string,
  fecha: string,
) {
  const target = EXTRA_TARGET[concepto]
  const { data: ex } = await supabase.from('pagos_extras')
    .select('id, monto').eq('alumna_id', alumna.id).eq('concepto', concepto).maybeSingle()
  const nuevo = Math.min(target, (ex ? Number(ex.monto) : 0) + monto)
  const estado = nuevo >= target ? 'pagado' : 'parcial'
  if (ex) {
    await supabase.from('pagos_extras').update({ monto: nuevo, estado, fecha_pago: fecha }).eq('id', ex.id)
  } else {
    await supabase.from('pagos_extras').insert({
      user_id: alumna.user_id, alumna_id: alumna.id, concepto, monto: nuevo, estado, fecha_pago: fecha,
    })
  }
  await supabase.from('movimientos_caja').insert({
    user_id: alumna.user_id, tipo: 'ingreso',
    concepto: `Pago en línea ${EXTRA_LABEL[concepto]} — ${alumna.nombre}`,
    monto, canal, categoria: concepto, fecha, alumna_id: alumna.id,
  })
  return { categoria: concepto }
}

// ── Aviso por correo de pago recibido (Resend). No bloquea si falla. ─────────
export async function enviarAvisoPago(opts: {
  nombre: string; monto: number; categoria: string; canal: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  if (!apiKey || !to) return // aún no configurado

  const catLabel =
    opts.categoria === 'ambos' ? 'Colegiatura + Bachillerato' :
    opts.categoria === 'colegiatura' ? 'Colegiatura' :
    opts.categoria === 'bachillerato' ? 'Bachillerato' : opts.categoria
  const monto = `$${Math.round(opts.monto).toLocaleString('es-MX')}`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CEA Aragón <onboarding@resend.dev>',
        to: [to],
        subject: `💰 Pago recibido: ${opts.nombre} — ${monto}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
          <h2 style="margin:0 0 8px">Pago en línea recibido</h2>
          <p style="font-size:16px;margin:0 0 4px"><b>${opts.nombre}</b> pagó <b>${monto}</b></p>
          <p style="color:#475569;margin:0 0 12px">${catLabel} · ${opts.canal}</p>
          <p style="color:#94a3b8;font-size:13px">Ya quedó registrado automáticamente en Caja y en la colegiatura del CRM.</p>
        </div>`,
      }),
    })
  } catch (e) {
    console.error('Resend error', e)
  }
}
