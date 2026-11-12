// Clientes de los servicios externos. Las claves viven como secretos de Supabase (Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2.106.1'

const env = (k: string, def?: string) => {
  const v = Deno.env.get(k) ?? def
  if (v === undefined) throw new Error(`Falta el secreto ${k}`)
  return v
}

/** Sigue trabajando después de responder al webhook (Supabase Edge Runtime). */
export function enSegundoPlano(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (rt) rt.waitUntil(p); else p.catch(() => null)
}

export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

/** 'sombra' = genera la respuesta pero no la envía ni toca citas (n8n sigue atendiendo). 'vivo' = atiende. */
export const MODO = () => env('AGENTE_MODO', 'sombra') as 'sombra' | 'vivo'

export function secretoValido(req: Request): boolean {
  const url = new URL(req.url)
  return (url.searchParams.get('k') ?? req.headers.get('x-secreto')) === env('WEBHOOK_SECRET')
}

// ---------- Chatwoot ----------
const CW = () => env('CHATWOOT_URL', 'https://n8n-chatwoot.tctagv.easypanel.host')
const CW_CUENTA = () => env('CHATWOOT_ACCOUNT_ID', '3')

async function chatwoot(ruta: string, metodo: string, cuerpo: unknown, token: string) {
  const r = await fetch(`${CW()}/api/v1/accounts/${CW_CUENTA()}${ruta}`, {
    method: metodo, headers: { api_access_token: token, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  if (!r.ok) throw new Error(`Chatwoot ${metodo} ${ruta}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
/** Mensaje del bot al cliente (o nota privada para el equipo). */
export const cwResponder = (conv: number, texto: string, privado = false) =>
  chatwoot(`/conversations/${conv}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: privado }, env('CHATWOOT_BOT_TOKEN'))
/** Pasa la conversación a un asesor: queda «Abierta» y la IA deja de responder. */
export const cwAbrir = (conv: number) =>
  chatwoot(`/conversations/${conv}/toggle_status`, 'POST', { status: 'open' }, env('CHATWOOT_API_TOKEN'))
export const cwRenombrar = (contacto: number, nombre: string) =>
  chatwoot(`/contacts/${contacto}`, 'PUT', { name: nombre }, env('CHATWOOT_API_TOKEN'))

// ---------- OpenAI ----------
export async function openai(mensajes: unknown[], herramientas: unknown[]) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env('OPENAI_MODEL', 'gpt-4o'), temperature: 0, messages: mensajes, tools: herramientas }),
    signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return (await r.json()).choices[0].message
}

// ---------- Twilio (WhatsApp) ----------
export async function twilioEnviar(telefono: string, datos: Record<string, string>) {
  const sid = env('TWILIO_ACCOUNT_SID')
  const cuerpo = new URLSearchParams({ From: env('TWILIO_FROM', 'whatsapp:+5215547368328'), To: `whatsapp:+${telefono}`, ...datos })
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', body: cuerpo,
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`), 'Content-Type': 'application/x-www-form-urlencoded' } })
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

/** Valida la firma X-Twilio-Signature (HMAC-SHA1 de la URL + parámetros ordenados). */
export async function firmaTwilioValida(url: string, params: Record<string, string>, firma: string | null): Promise<boolean> {
  if (!firma) return false
  const datos = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('TWILIO_AUTH_TOKEN')), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(datos)))
  return btoa(String.fromCharCode(...sig)) === firma
}

// ---------- Telegram (avisos a Alex) ----------
export async function telegram(texto: string) {
  const r = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID', '127795338'), text: texto, disable_web_page_preview: true }) })
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

// ---------- Meta (API de conversiones) ----------
export async function metaEvento(evento: Record<string, unknown>) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env('META_DATASET_ID', '1525711985074591')}/events?access_token=${env('META_CAPI_TOKEN')}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [evento] }) })
  return { ok: r.ok, status: r.status, cuerpo: await r.json().catch(() => null) }
}
