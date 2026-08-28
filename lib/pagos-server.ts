// lib/pagos-server.ts — Aplicar un pago (en línea) a una alumna, en el SERVIDOR.
// Reutiliza la lógica pura de lib/acumulacion.ts. Escribe en Supabase con el
// cliente admin (service_role) que se le pasa. No usar en el cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planColegiatura, planBachillerato, mesToBachiTipo,
  mesesAdeudadosCol, mesesAdeudadosBachi, inicioCobro,
} from './acumulacion'
import { EXTRA_TARGET, EXTRA_LABEL } from './extras'
import type { PaymentCalendar } from './nomina'
import { recargosColegiatura, totalRecargo, setDeExenciones } from './recargos'

interface AlumnaPago {
  id: string
  user_id: string
  nombre: string
  programa: string
  cuota_mensual: number
  grupo_id?: string | null
  created_at?: string | null
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

  // Desde cuándo se le puede cobrar (necesario si aún no tiene ningún registro de pago)
  // y calendario de su grupo (para el recargo por pago tardío).
  let inicioGrupoRaw: { anio: number; mes: number } | null = null
  let calendario: PaymentCalendar | null = null
  if (alumna.grupo_id) {
    const { data: g } = await supabase.from('grupos')
      .select('anio_inicio, mes_inicio, calendario_id').eq('id', alumna.grupo_id).maybeSingle()
    if (g?.anio_inicio && g?.mes_inicio) inicioGrupoRaw = { anio: g.anio_inicio, mes: g.mes_inicio }
    if (g?.calendario_id) {
      const { data: kv } = await supabase.from('app_kv')
        .select('value').eq('user_id', alumna.user_id).eq('key', 'payment_calendars_v2').maybeSingle()
      const cals = Array.isArray(kv?.value) ? (kv!.value as PaymentCalendar[]) : []
      calendario = cals.find(c => c.id === g.calendario_id) ?? null
    }
  }
  const inicioGrupo = inicioCobro(inicioGrupoRaw, alumna.created_at)
  const hoyISO = new Date(Date.UTC(anio, mes - 1, diaHoy)).toISOString().slice(0, 10)

  // Prefetch + recargo por pago tardío (sólo sobre colegiatura)
  let colExisting: { id: string; anio: number; mes: number; monto: number; estado: string }[] = []
  let bachiExisting: { id: string; anio: number; tipo: string; monto: number; estado: string }[] = []
  let recargoDebido = 0
  if (esCol) {
    const { data } = await supabase.from('pagos_colegiaturas')
      .select('id, anio, mes, monto, estado').eq('alumna_id', alumna.id)
    colExisting = data ?? []
    const adeudoCol = mesesAdeudadosCol(colExisting, colLimit, anio, mes, inicioGrupo)
    const { data: exFilas } = await supabase.from('recargo_exenciones')
      .select('anio, mes').eq('alumna_id', alumna.id)
    recargoDebido = totalRecargo(
      recargosColegiatura(calendario, adeudoCol, hoyISO, setDeExenciones(exFilas)))
  }
  if (esBachi) {
    const { data } = await supabase.from('pagos_bachillerato')
      .select('id, anio, tipo, monto, estado').eq('alumna_id', alumna.id)
    bachiExisting = data ?? []
  }

  // El recargo NO es colegiatura: se aparta antes de repartir el pago entre los meses.
  // Si se dejara dentro, el 10% rebosaría al mes siguiente y lo daría por pagado en parte.
  const recargo = Math.min(recargoDebido, monto)
  const montoMeses = monto - recargo

  const aplicarCol = async (m: number) => {
    if (m <= 0) return
    const plan = planColegiatura(colExisting, m, anio, mes, colLimit)
    for (const w of plan) {
      const estado = w.estado
      const montoW = w.monto
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
    // Lo que debe de bachillerato va íntegro a bachillerato y el resto a colegiatura
    // (el recargo ya está fuera de `montoMeses`, así que no descuadra el reparto).
    const bachiOwed = mesesAdeudadosBachi(bachiExisting, 1000, anio, mesToBachiTipo(mes), inicioGrupo)
      .reduce((s, x) => s + x.falta, 0)
    const aBachi = Math.min(bachiOwed, montoMeses)
    await aplicarCol(montoMeses - aBachi)
    await aplicarBachi(aBachi)
  } else if (esCol) {
    await aplicarCol(montoMeses)
  } else if (esBachi) {
    await aplicarBachi(montoMeses)
  }

  // Movimiento en caja por el total recibido (categoría 'ambos' → el margen lo trata 50-50).
  // El recargo se deja anotado en el concepto para que se vea de dónde sale el importe.
  const categoria = alumna.programa === 'ambos' ? 'ambos' : (esCol ? 'colegiatura' : 'bachillerato')
  await supabase.from('movimientos_caja').insert({
    user_id: alumna.user_id,
    tipo: 'ingreso',
    concepto: recargo > 0
      ? `Pago en línea — ${alumna.nombre} (incluye $${Math.round(recargo).toLocaleString('es-MX')} de recargo)`
      : `Pago en línea — ${alumna.nombre}`,
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

/** Pago de inscripción de un prospecto nuevo (sin alumna todavía): marca el prospecto
 *  como "inscrito" e inserta el movimiento en caja, sin alumna_id (aún no existe). */
export async function aplicarInscripcion(
  supabase: SupabaseClient,
  prospecto: { id: string; user_id: string; nombre: string },
  monto: number,
  canal: string,
  fecha: string,
) {
  await supabase.from('prospectos').update({ status: 'inscrito' }).eq('id', prospecto.id)
  await supabase.from('movimientos_caja').insert({
    user_id: prospecto.user_id,
    tipo: 'ingreso',
    concepto: `Inscripción — ${prospecto.nombre}`,
    monto, canal, categoria: 'inscripcion', fecha, alumna_id: null,
  })
  return { categoria: 'inscripcion' }
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
    opts.categoria === 'bachillerato' ? 'Bachillerato' :
    opts.categoria === 'inscripcion' ? 'Inscripción (prospecto nuevo)' : opts.categoria
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
