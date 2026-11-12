// Agente de WhatsApp de CEA Aragón. Recibe los webhooks de Chatwoot (message_created) y responde con IA.
// Modo sombra: n8n sigue contestando; aquí se guarda la memoria y la respuesta que habríamos dado (agente_sombra).
// Modo vivo: contesta por Chatwoot y gestiona las citas de verdad.
import { db, MODO, secretoValido, cwResponder, openai, telegram, enSegundoPlano } from '../_shared/servicios.ts'
import { HERRAMIENTAS, ejecutar, type Contexto } from '../_shared/herramientas.ts'
import { construirPrompt } from '../_shared/prompt.ts'
import { type Config, fechaLarga, horaMX, fechaMX } from '../_shared/fechas.ts'

const ESPERA_MS = 5000           // si escribe varios mensajes seguidos, se contesta una sola vez al último
const MEMORIA = 15               // mensajes de historial que ve la IA (igual que en n8n)

const soloLetras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

type Evento = {
  event: string; id: number; content?: string; message_type: string; private?: boolean
  attachments?: { file_type: string }[]
  sender?: { id?: number; name?: string; phone_number?: string; type?: string }
  conversation?: { id: number; status: string; meta?: { sender?: { id?: number; name?: string; phone_number?: string } } }
}

async function leadDe(ev: Evento, telefono: string) {
  const contacto = ev.conversation?.meta?.sender
  const { data } = await db.from('leads').select('id, telefono, nombre, mensajes, estado').eq('telefono', telefono).maybeSingle()
  const cw = { chatwoot_contact_id: contacto?.id ?? null, chatwoot_conversation_id: ev.conversation?.id ?? null }
  if (data) {
    await db.from('leads').update(cw).eq('id', data.id)
    return data
  }
  const nombre = contacto?.name && !/^\+?\d+$/.test(contacto.name) ? contacto.name : null
  const { data: nuevo, error } = await db.from('leads').insert({ telefono, nombre, ...cw }).select('id, telefono, nombre, mensajes, estado').single()
  if (error) throw error
  return nuevo
}

async function guardar(lead: { id: string; telefono: string }, rol: string, contenido: Record<string, unknown>) {
  await db.from('chat_mensajes').insert({ lead_id: lead.id, telefono: lead.telefono, rol, contenido })
}

async function historial(telefono: string) {
  const { data } = await db.from('chat_mensajes').select('rol, contenido').eq('telefono', telefono)
    .in('rol', ['user', 'assistant', 'humano']).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MEMORIA)
  return (data ?? []).reverse().map((m: { rol: string; contenido: { texto?: string } }) => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: String(m.contenido.texto ?? '') }))
}

async function generar(ctx: Contexto, telefono: string) {
  const mensajes: Record<string, unknown>[] = [{ role: 'system', content: construirPrompt(ctx.config, ctx.lead.nombre) }, ...await historial(telefono)]
  const usadas: { nombre: string; args: unknown; resultado: unknown }[] = []
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const m = await openai(mensajes, HERRAMIENTAS)
    if (!m.tool_calls?.length) return { texto: aWhatsApp(m.content ?? ''), usadas }
    mensajes.push(m)
    for (const t of m.tool_calls) {
      let args = {}
      try { args = JSON.parse(t.function.arguments || '{}') } catch { /* argumentos mal formados: se ejecuta sin ellos */ }
      const resultado = await ejecutar(t.function.name, args, ctx).catch(e => ({ error: `Fallo técnico: ${e.message}` }))
      usadas.push({ nombre: t.function.name, args, resultado })
      mensajes.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(resultado) })
    }
  }
  throw new Error('La IA no terminó de responder tras 6 vueltas de herramientas')
}

async function procesar(ev: Evento) {
  if (ev.event !== 'message_created' || ev.private) return
  const conv = ev.conversation?.id ?? null
  const telefono = (ev.conversation?.meta?.sender?.phone_number || ev.sender?.phone_number || '').replace(/\D/g, '')
  if (!telefono) return
  const sombra = MODO() === 'sombra'
  const lead = await leadDe(ev, telefono)
  const adjunto = ev.attachments?.length ? `[El usuario envió un archivo: ${ev.attachments.map(a => a.file_type).join(', ')}]` : ''
  const texto = (ev.content || '').trim() || adjunto

  if (ev.message_type === 'outgoing') {
    // Respuestas que ya guardamos al enviarlas: no duplicar (el webhook puede llegar antes de que terminemos de guardar)
    if (!sombra && ev.sender?.type === 'agent_bot') return
    await new Promise(r => setTimeout(r, 3000))
    const { count } = await db.from('chat_mensajes').select('id', { count: 'exact', head: true })
      .eq('telefono', telefono).eq('contenido->>cw_id', String(ev.id))
    if (!count && texto) await guardar(lead, sombra ? 'assistant' : 'humano', { texto, cw_id: ev.id })
    return
  }
  if (ev.message_type !== 'incoming' || !texto) return

  await guardar(lead, 'user', { texto, cw_id: ev.id })
  await db.from('leads').update({ mensajes: (lead.mensajes ?? 0) + 1, ultimo_mensaje: new Date().toISOString(),
    ...(lead.estado === 'nuevo' && (lead.mensajes ?? 0) >= 1 ? { estado: 'platicando' } : {}) }).eq('id', lead.id)

  // CONFIRMO al recordatorio de 24 h: se resuelve sin IA
  if (soloLetras(texto) === 'confirmo') {
    const { data: cita } = await db.from('citas').select('id, inicio, modalidad').eq('lead_id', lead.id)
      .in('estado', ['agendada', 'confirmada']).gte('inicio', new Date().toISOString()).order('inicio').limit(1).maybeSingle()
    if (cita) {
      if (sombra) {
        await db.from('agente_sombra').insert({ telefono, conversacion: conv, mensaje: texto, respuesta: '[CONFIRMO: se marcaría la cita como confirmada]' })
        return
      }
      await db.from('citas').update({ estado: 'confirmada', confirmada_at: new Date().toISOString() }).eq('id', cita.id)
      const r = '¡Gracias! ✅ Tu cita queda confirmada. Te esperamos. Si necesitas cambiarla, escríbenos.'
      const enviado = await cwResponder(conv!, r)
      await guardar(lead, 'assistant', { texto: r, cw_id: enviado.id })
      const d = new Date(cita.inicio)
      await cwResponder(conv!, `✅ CITA CONFIRMADA por el cliente: ${fechaLarga(fechaMX(d))} a las ${horaMX(d)} · ${cita.modalidad ?? '-'}`, true)
      return
    }
  }

  if (ev.conversation?.status !== 'pending') return     // conversación abierta = la atiende un asesor

  // Espera corta: si llega otro mensaje del mismo usuario, se contesta ese y no este
  await new Promise(r => setTimeout(r, ESPERA_MS))
  const { data: ultimo } = await db.from('chat_mensajes').select('contenido').eq('telefono', telefono).eq('rol', 'user')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).single()
  if (ultimo && String(ultimo.contenido.cw_id) !== String(ev.id)) return

  const { data: cfg } = await db.from('agente_config').select('datos').limit(1).single()
  const ctx: Contexto = { lead, conv, contacto: ev.conversation?.meta?.sender?.id ?? null, sombra, config: cfg!.datos as Config }
  try {
    const { texto: respuesta, usadas } = await generar(ctx, telefono)
    if (sombra) {
      await db.from('agente_sombra').insert({ telefono, conversacion: conv, mensaje: texto, respuesta, herramientas: usadas })
      return
    }
    if (!respuesta) return
    const enviado = await cwResponder(conv!, respuesta)
    await guardar(lead, 'assistant', { texto: respuesta, cw_id: enviado.id, herramientas: usadas.length ? usadas : undefined })
  } catch (e) {
    console.error('agente', telefono, e)
    if (sombra) {
      await db.from('agente_sombra').insert({ telefono, conversacion: conv, mensaje: texto, respuesta: null, error: String(e) })
      return
    }
    await cwResponder(conv!, `⚠️ La IA no pudo responder este mensaje (${String(e).slice(0, 120)}). Atiéndelo a mano.`, true).catch(() => null)
    await telegram(`⚠️ El agente de WhatsApp falló con ${telefono}: ${String(e).slice(0, 200)}`).catch(() => null)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  if (!secretoValido(req)) return new Response('no autorizado', { status: 401 })
  const ev = await req.json().catch(() => null) as Evento | null
  if (ev) enSegundoPlano(procesar(ev).catch(e => console.error('agente', e)))
  return new Response('ok')                       // Chatwoot no espera la respuesta de la IA
})

/** Formato de WhatsApp: *negrita* con un asterisco, sin títulos de Markdown. */
function aWhatsApp(t: string) {
  return t.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/__(.+?)__/g, '_$1_').replace(/^#{1,6}\s+/gm, '').trim()
}
