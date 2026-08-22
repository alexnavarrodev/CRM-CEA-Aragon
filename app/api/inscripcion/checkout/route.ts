// POST /api/inscripcion/checkout — crea una orden de pago de INSCRIPCIÓN para un
// prospecto nuevo (todavía sin cuenta de alumna). Body: { nombre, telefono, email }.
// Monto fijo. Registra/actualiza al prospecto en el CRM y arma la preferencia de MP.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm-cea-aragon.netlify.app'
const INSCRIPCION_MONTO = 500
// CRM de un solo tenant (la directora) — mismo id documentado en CONTEXTO.md.
const DIRECTORA_USER_ID = 'f758905b-9729-4e40-ad58-45e50e545380'

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

  let nombre = '', telefono = '', email = ''
  try {
    const b = await req.json()
    nombre = String(b.nombre || '').trim()
    telefono = String(b.telefono || '').trim()
    email = String(b.email || '').trim()
  } catch { /* noop */ }

  if (!nombre || !telefono || !email) {
    return NextResponse.json({ error: 'Falta nombre, teléfono o correo' }, { status: 400 })
  }

  const supabase = admin()

  // Busca un prospecto existente por teléfono para no duplicar si reintenta el pago.
  const { data: existente } = await supabase.from('prospectos')
    .select('id').eq('user_id', DIRECTORA_USER_ID).eq('telefono', telefono).maybeSingle()

  let prospectoId = existente?.id as string | undefined
  if (prospectoId) {
    await supabase.from('prospectos').update({ nombre, email }).eq('id', prospectoId)
  } else {
    const { data: nuevo, error: insErr } = await supabase.from('prospectos').insert({
      user_id: DIRECTORA_USER_ID, nombre, telefono, email,
      interes: 'Inscripción en línea', status: 'interesado',
      fecha_contacto: new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10),
    }).select('id').single()
    if (insErr) console.error('Insert prospecto error:', insErr)
    prospectoId = nuevo?.id
  }
  if (!prospectoId) return NextResponse.json({ error: 'No se pudo registrar tus datos' }, { status: 500 })

  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Inscripción — ${nombre}`, quantity: 1, unit_price: INSCRIPCION_MONTO, currency_id: 'MXN' }],
      payer: { name: nombre, email },
      external_reference: `insc|${prospectoId}`,
      notification_url: `${SITE}/api/pagos/webhook`,
      back_urls: {
        success: `${SITE}/inscribete?pago=ok`,
        failure: `${SITE}/inscribete?pago=err`,
        pending: `${SITE}/inscribete?pago=pend`,
      },
      auto_return: 'approved',
      statement_descriptor: 'CEA ARAGON',
    }),
  })

  if (!prefRes.ok) {
    const txt = await prefRes.text()
    console.error('MP preference error (inscripcion):', txt)
    return NextResponse.json({ error: 'No se pudo crear el pago' }, { status: 502 })
  }

  const pref = await prefRes.json()
  return NextResponse.json({ init_point: pref.init_point ?? pref.sandbox_init_point })
}
