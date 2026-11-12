// Entrada de WhatsApp desde Twilio: guarda de qué anuncio viene el lead (ctwa_clid) y reenvía el mensaje a Chatwoot.
// Reemplaza el flujo de n8n "CTWA Captura (Twilio → Chatwoot)". Twilio debe apuntar a esta función.
import { db, firmaTwilioValida, enSegundoPlano } from '../_shared/servicios.ts'

const CHATWOOT_TWILIO = () => (Deno.env.get('CHATWOOT_URL') ?? 'https://n8n-chatwoot.tctagv.easypanel.host') + '/twilio/callback'
const URL_PUBLICA = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/entrada-twilio`
const XML_VACIO = () => new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } })

async function guardarAnuncio(p: Record<string, string>) {
  const telefono = (p.WaId || p.From || '').replace(/\D/g, '')
  if (!telefono || !p.ReferralCtwaClid) return
  const datos = { fuente: 'anuncio', ctwa_clid: p.ReferralCtwaClid, anuncio_id: p.ReferralSourceId || null,
    anuncio_titulo: (p.ReferralHeadline || '').slice(0, 300) || null, ultimo_mensaje: new Date().toISOString() }
  const { data: previo } = await db.from('leads').select('id, ctwa_clid').eq('telefono', telefono).maybeSingle()
  const { data: lead, error } = previo
    ? await db.from('leads').update(datos).eq('id', previo.id).select('id').single()
    : await db.from('leads').insert({ telefono, nombre: p.ProfileName || null, ...datos }).select('id').single()
  if (error) throw error
  // Un evento Lead por cada clic de anuncio distinto
  if (previo?.ctwa_clid !== p.ReferralCtwaClid)
    await db.from('eventos_meta').insert({ lead_id: lead.id, evento: 'Lead', event_id: `lead_${p.ReferralCtwaClid}` })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const cuerpo = await req.text()
  const p = Object.fromEntries(new URLSearchParams(cuerpo))
  if (!(await firmaTwilioValida(URL_PUBLICA(), p, req.headers.get('X-Twilio-Signature'))))
    return new Response('firma inválida', { status: 403 })
  enSegundoPlano(guardarAnuncio(p).catch(e => console.error('entrada-twilio', e)))
  // El mensaje tiene que llegar a Chatwoot sí o sí, aunque falle lo demás
  const r = await fetch(CHATWOOT_TWILIO(), { method: 'POST', body: cuerpo,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(14000) }).catch(e => e)
  if (!(r instanceof Response) || !r.ok) console.error('entrada-twilio: Chatwoot no aceptó el mensaje', r instanceof Response ? r.status : String(r))
  return XML_VACIO()
})
