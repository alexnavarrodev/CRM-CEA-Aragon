// Tareas programadas (pg_cron cada 10 min): recordatorio de 24 h, aviso de citas sin confirmar, audio de
// bienvenida, resumen diario para marcar llegadas y envío de eventos a Meta. En modo sombra no hace nada.
import { db, MODO, secretoValido, twilioEnviar, telegram, metaEvento } from '../_shared/servicios.ts'
import { fechaLarga, fechaMX, horaMX, ahoraMX } from '../_shared/fechas.ts'

const PLANTILLA_24H = 'HX99495ce79738e617de8d3b102c0a9a34'   // recordatorio_24h_v2 (aprobada): pide responder CONFIRMO
const AUDIO = 'https://zwyttylnpqofwgbcnbyx.supabase.co/storage/v1/object/public/media/audio-motivacion-cita.ogg'
const H = 3600 * 1000
const enMs = (h: number) => new Date(Date.now() + h * H).toISOString()
const cuando = (iso: string) => { const d = new Date(iso); return `${fechaLarga(fechaMX(d))} a las ${horaMX(d)}` }
const META_NOMBRE: Record<string, string> = { Lead: 'Lead', Schedule: 'Schedule', Asistio: 'Asistio', Inscripcion: 'CompleteRegistration' }

type Cita = { id: string; inicio: string; modalidad: string | null; leads: { telefono: string; nombre: string | null; opt_out: boolean } }
const CITA = 'id, inicio, modalidad, leads!inner(telefono, nombre, opt_out)'

async function recordatorios24h(log: string[]) {
  const { data } = await db.from('citas').select(CITA).in('estado', ['agendada', 'confirmada'])
    .is('recordatorio_24h_at', null).gt('inicio', enMs(1)).lte('inicio', enMs(24))
  for (const c of (data ?? []) as unknown as Cita[]) {
    if (c.leads.opt_out) continue
    const d = new Date(c.inicio), l = new Date(d.getTime() - 6 * H)
    const fecha = `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()} a las ${horaMX(d)}`
    await twilioEnviar(c.leads.telefono, { ContentSid: PLANTILLA_24H,
      ContentVariables: JSON.stringify({ 1: c.leads.nombre || '', 2: c.modalidad || 'informes', 3: fecha }) })
    await db.from('citas').update({ recordatorio_24h_at: new Date().toISOString() }).eq('id', c.id)
    log.push(`recordatorio ${c.leads.telefono}`)
  }
}

async function avisoSinConfirmar(log: string[]) {
  const { data } = await db.from('citas').select(CITA).eq('estado', 'agendada').not('recordatorio_24h_at', 'is', null)
    .is('aviso_sin_confirmar_at', null).gt('inicio', new Date().toISOString()).lte('inicio', enMs(6))
  for (const c of (data ?? []) as unknown as Cita[]) {
    await telegram(`⚠️ CITA SIN CONFIRMAR\n👤 ${c.leads.nombre || 'Sin nombre'} — ${c.modalidad || '-'}\n🗓 ${cuando(c.inicio)}\n` +
      `No respondió CONFIRMO al recordatorio de 24 h.\nDale un toque personal: https://wa.me/${c.leads.telefono}`)
    await db.from('citas').update({ aviso_sin_confirmar_at: new Date().toISOString() }).eq('id', c.id)
    log.push(`aviso ${c.leads.telefono}`)
  }
}

async function audioBienvenida(log: string[]) {
  const { data } = await db.from('citas').select(CITA).eq('origen', 'agente').is('audio_enviado_at', null)
    .in('estado', ['agendada', 'confirmada']).gt('created_at', new Date(Date.now() - 2 * H).toISOString())
  for (const c of (data ?? []) as unknown as Cita[]) {
    const t = c.leads.telefono
    await twilioEnviar(t, { Body: '¡Gracias por agendar! Escucha esto 👇 Te esperamos 💙' })
    await twilioEnviar(t, { MediaUrl: AUDIO })
    await twilioEnviar(t, { Body: '🌐 Conoce más sobre nosotros: https://colegioenfermeriaangeles.com.mx/' })
    await db.from('citas').update({ audio_enviado_at: new Date().toISOString() }).eq('id', c.id)
    log.push(`audio ${t}`)
  }
}

async function resumenLlegadas(log: string[]) {
  const ahora = ahoraMX()
  if (ahora.getUTCHours() !== 20 || ahora.getUTCMinutes() >= 10) return     // una vez al día, a las 20:00
  const hoy = ahora.toISOString().slice(0, 10)
  const { data } = await db.from('citas').select(CITA).in('estado', ['agendada', 'confirmada'])
    .gte('inicio', `${hoy}T00:00:00-06:00`).lt('inicio', new Date().toISOString()).order('inicio')
  const citas = (data ?? []) as unknown as Cita[]
  if (!citas.length) return
  await telegram(`📋 Citas de hoy sin marcar (${citas.length}). Márcalas en el CRM → Citas:\n` +
    citas.map(c => `• ${horaMX(new Date(c.inicio))} ${c.leads.nombre || c.leads.telefono}`).join('\n'))
  log.push(`resumen ${citas.length}`)
}

async function eventosMeta(log: string[]) {
  const { data } = await db.from('eventos_meta').select('id, evento, event_id, valor, creado_at, intentos, leads(ctwa_clid)')
    .is('enviado_at', null).lt('intentos', 5).order('creado_at').limit(50)
  for (const e of data ?? []) {
    const clid = (e.leads as unknown as { ctwa_clid: string | null } | null)?.ctwa_clid
    const viejo = Date.now() - new Date(e.creado_at).getTime() > 6.5 * 24 * H      // Meta rechaza eventos de más de 7 días
    if (!clid || viejo) {
      await db.from('eventos_meta').update({ enviado_at: new Date().toISOString(), respuesta: { omitido: !clid ? 'sin ctwa_clid' : 'más de 7 días' } }).eq('id', e.id)
      continue
    }
    const r = await metaEvento({ event_name: META_NOMBRE[e.evento], event_time: Math.floor(new Date(e.creado_at).getTime() / 1000),
      action_source: 'business_messaging', messaging_channel: 'whatsapp', event_id: e.event_id, user_data: { ctwa_clid: clid },
      ...(e.valor ? { custom_data: { value: Number(e.valor), currency: 'MXN' } } : {}) })
    await db.from('eventos_meta').update(r.ok ? { enviado_at: new Date().toISOString(), respuesta: r.cuerpo }
      : { intentos: e.intentos + 1, respuesta: r.cuerpo }).eq('id', e.id)
    log.push(`meta ${e.evento} ${r.ok ? 'ok' : r.status}`)
  }
}

Deno.serve(async (req) => {
  if (!secretoValido(req)) return new Response('no autorizado', { status: 401 })
  if (MODO() !== 'vivo') return Response.json({ modo: 'sombra', hecho: [] })
  const log: string[] = [], errores: string[] = []
  for (const tarea of [recordatorios24h, avisoSinConfirmar, audioBienvenida, resumenLlegadas, eventosMeta])
    await tarea(log).catch(e => errores.push(`${tarea.name}: ${e.message}`))
  if (errores.length) await telegram(`⚠️ Tareas del agente con error:\n${errores.join('\n')}`).catch(() => null)
  return Response.json({ hecho: log, errores })
})
