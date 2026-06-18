// lib/pagos-server.ts — Aplicar un pago (en línea) a una alumna, en el SERVIDOR.
// Reutiliza la lógica pura de lib/acumulacion.ts. Escribe en Supabase con el
// cliente admin (service_role) que se le pasa. No usar en el cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planColegiatura, planBachillerato, mesToBachiTipo,
  mesesAdeudadosCol, aplicaDescuentoProntoPago, PRONTO_PAGO_MONTO,
} from './acumulacion'

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

  const aplicarCol = async (m: number) => {
    if (m <= 0) return
    const { data: existing } = await supabase
      .from('pagos_colegiaturas').select('id, anio, mes, monto, estado')
      .eq('alumna_id', alumna.id)
    const plan = planColegiatura(existing ?? [], m, anio, mes, colLimit)
    // Descuento pronto pago: completar el mes actual aunque entren $50 menos
    const adeudoCol = mesesAdeudadosCol(existing ?? [], colLimit, anio, mes)
    const desc = aplicaDescuentoProntoPago(alumna.programa, diaHoy, adeudoCol, anio, mes, colLimit)
      ? PRONTO_PAGO_MONTO : 0
    for (const w of plan) {
      let estado = w.estado
      if (desc > 0 && w.anio === anio && w.mes === mes && estado === 'parcial'
          && (colLimit - w.monto) <= desc) {
        estado = 'pagado' // el descuento completa el mes
      }
      if (w.id) {
        await supabase.from('pagos_colegiaturas')
          .update({ monto: w.monto, estado, fecha_pago: fecha }).eq('id', w.id)
      } else {
        await supabase.from('pagos_colegiaturas').insert({
          user_id: alumna.user_id, alumna_id: alumna.id, anio: w.anio, mes: w.mes,
          monto: w.monto, estado, fecha_pago: fecha,
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

  return { categoria }
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
