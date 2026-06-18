// POST /api/pagos/checkout  — crea una orden de pago (Checkout Pro) en Mercado Pago.
// Body: { token, concepto } donde concepto ∈ 'mensualidad' | 'uniforme' | 'certificado'.
// Calcula el importe en el servidor (no se fía del cliente) y devuelve { init_point }.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, aplicaDescuentoProntoPago, PRONTO_PAGO_MONTO } from '@/lib/acumulacion'
import { EXTRA_TARGET, EXTRA_LABEL } from '@/lib/extras'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm-cea-aragon.netlify.app'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!mpToken) return NextResponse.json({ error: 'Pago en línea no configurado' }, { status: 503 })

  let token = '', concepto = 'mensualidad'
  try { const b = await req.json(); token = b.token; concepto = b.concepto || 'mensualidad' } catch { /* noop */ }
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 })

  const supabase = admin()
  const { data: alumna } = await supabase
    .from('alumnas').select('id, nombre, programa, cuota_mensual')
    .eq('pago_token', token).maybeSingle()
  if (!alumna) return NextResponse.json({ error: 'Alumna no encontrada' }, { status: 404 })

  const now = new Date(Date.now() - 6 * 3600 * 1000)
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1

  let total = 0
  let itemTitle = ''

  if (concepto === 'uniforme' || concepto === 'certificado') {
    const target = EXTRA_TARGET[concepto]
    const { data } = await supabase.from('pagos_extras')
      .select('monto').eq('alumna_id', alumna.id).eq('concepto', concepto).maybeSingle()
    const pagado = data ? Number(data.monto) : 0
    total = Math.max(0, target - pagado)
    itemTitle = `${EXTRA_LABEL[concepto]} — ${alumna.nombre}`
  } else {
    concepto = 'mensualidad'
    const colLimit = alumna.programa === 'ambos' ? 1000 : (Number(alumna.cuota_mensual) || 1000)
    let adeudoCol: ReturnType<typeof mesesAdeudadosCol> = []
    if (alumna.programa === 'colegiaturas' || alumna.programa === 'ambos') {
      const { data } = await supabase.from('pagos_colegiaturas').select('id, anio, mes, monto, estado').eq('alumna_id', alumna.id)
      adeudoCol = mesesAdeudadosCol(data ?? [], colLimit, y, m)
      total += adeudoCol.reduce((s, x) => s + x.falta, 0)
    }
    if (alumna.programa === 'bachillerato' || alumna.programa === 'ambos') {
      const { data } = await supabase.from('pagos_bachillerato').select('id, anio, tipo, monto, estado').eq('alumna_id', alumna.id)
      total += mesesAdeudadosBachi(data ?? [], 1000, y, mesToBachiTipo(m)).reduce((s, x) => s + x.falta, 0)
    }
    const descuento = aplicaDescuentoProntoPago(alumna.programa, now.getUTCDate(), adeudoCol, y, m, colLimit)
      ? PRONTO_PAGO_MONTO : 0
    total = Math.max(0, total - descuento)
    itemTitle = `Colegiatura — ${alumna.nombre}`
  }

  if (total <= 0) return NextResponse.json({ error: 'No hay nada pendiente de este concepto' }, { status: 400 })

  // Crear preferencia en Mercado Pago
  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: itemTitle, quantity: 1, unit_price: Math.round(total), currency_id: 'MXN' }],
      external_reference: `${alumna.id}|${concepto}`,   // el webhook re-deriva qué aplicar
      notification_url: `${SITE}/api/pagos/webhook`,
      back_urls: {
        success: `${SITE}/pagar/${token}?pago=ok`,
        failure: `${SITE}/pagar/${token}?pago=err`,
        pending: `${SITE}/pagar/${token}?pago=pend`,
      },
      auto_return: 'approved',
      statement_descriptor: 'CEA ARAGON',
    }),
  })

  if (!prefRes.ok) {
    const txt = await prefRes.text()
    console.error('MP preference error:', txt)
    return NextResponse.json({ error: 'No se pudo crear el pago' }, { status: 502 })
  }

  const pref = await prefRes.json()
  return NextResponse.json({ init_point: pref.init_point ?? pref.sandbox_init_point })
}
