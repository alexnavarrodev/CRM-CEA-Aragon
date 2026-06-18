// POST /api/pagos/webhook — Mercado Pago confirma un pago.
// 1) Verifica la firma (si hay MP_WEBHOOK_SECRET).
// 2) Consulta el pago en MP. 3) Si está aprobado y no se procesó antes,
//    lo aplica (Caja + Colegiatura/Bachillerato) de forma idempotente.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { aplicarPagoAlumna, aplicarPagoExtra, enviarAvisoPago } from '@/lib/pagos-server'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Verifica x-signature de Mercado Pago. Si no hay secreto configurado, no bloquea.
function firmaValida(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return true // aún no configurado → no bloquear (modo prueba)
  const sig = req.headers.get('x-signature') || ''
  const reqId = req.headers.get('x-request-id') || ''
  const parts = Object.fromEntries(sig.split(',').map(p => p.split('=').map(s => s.trim())))
  const ts = parts['ts']; const v1 = parts['v1']
  if (!ts || !v1) return false
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!mpToken) return NextResponse.json({ ok: true }) // nada que hacer

  // El id del pago llega por query (?data.id=) o en el body { data: { id } }
  const url = new URL(req.url)
  let dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || ''
  let topic = url.searchParams.get('type') || url.searchParams.get('topic') || ''
  try {
    const body = await req.json()
    if (body?.data?.id) dataId = String(body.data.id)
    if (body?.type) topic = body.type
  } catch { /* sin body */ }

  // Solo notificaciones de pago
  if (topic && topic !== 'payment') return NextResponse.json({ ok: true })
  if (!dataId) return NextResponse.json({ ok: true })

  if (!firmaValida(req, dataId)) {
    console.warn('Webhook MP: firma inválida')
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 })
  }

  // Consultar el pago real en Mercado Pago
  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  })
  if (!payRes.ok) {
    console.error('MP payment fetch error', await payRes.text())
    return NextResponse.json({ ok: true }) // 200 para que MP no reintente infinito
  }
  const pago = await payRes.json()

  if (pago.status !== 'approved') return NextResponse.json({ ok: true })

  const supabase = admin()
  const mpPaymentId = String(pago.id)

  // Idempotencia: si ya está registrado, no duplicar
  const { data: yaExiste } = await supabase
    .from('pagos_online').select('id').eq('mp_payment_id', mpPaymentId).maybeSingle()
  if (yaExiste) return NextResponse.json({ ok: true, duplicado: true })

  // external_reference = "<alumnaId>|<concepto>"  (concepto: mensualidad|uniforme|certificado)
  const [alumnaId, conceptoRaw] = String(pago.external_reference || '').split('|')
  const concepto = conceptoRaw || 'mensualidad'
  const { data: alumna } = await supabase
    .from('alumnas').select('id, user_id, nombre, programa, cuota_mensual')
    .eq('id', alumnaId).maybeSingle()
  if (!alumna) {
    console.error('Webhook MP: alumna no encontrada', alumnaId)
    return NextResponse.json({ ok: true })
  }

  const monto = Number(pago.transaction_amount) || 0
  const canal = (pago.payment_type_id || '').includes('card') ? 'tarjeta' : 'transferencia'
  const fecha = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10)

  // Registrar primero el control (idempotencia) — si choca el UNIQUE, otro proceso ya lo hizo
  const { error: insErr } = await supabase.from('pagos_online').insert({
    user_id: alumna.user_id, alumna_id: alumna.id, mp_payment_id: mpPaymentId,
    monto, estado: 'approved', canal, raw: pago,
  })
  if (insErr) {
    return NextResponse.json({ ok: true, duplicado: true })
  }

  // Aplicar según el concepto
  let categoria = 'mensualidad'
  if (concepto === 'uniforme' || concepto === 'certificado') {
    const res = await aplicarPagoExtra(supabase, alumna, concepto, monto, canal, fecha)
    categoria = res.categoria
  } else {
    const res = await aplicarPagoAlumna(supabase, alumna, monto, canal, fecha)
    categoria = res?.categoria ?? ''
  }

  // Aviso por correo (si está configurado RESEND_API_KEY + NOTIFY_EMAIL)
  await enviarAvisoPago({ nombre: alumna.nombre, monto, categoria, canal })

  return NextResponse.json({ ok: true })
}
