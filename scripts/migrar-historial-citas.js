// Migra al CRM el historial de la base del agente de WhatsApp en n8n (proyecto zwyttylnpqofwgbcnbyx):
// leads de anuncios (ctwa_leads), seguimiento (cold_leads_tracking), citas (appointments) y memoria del chat.
// Idempotente: se puede volver a correr (upsert por teléfono; las citas históricas se borran y se reinsertan).
// Uso: node scripts/migrar-historial-citas.js      (usa el token sbp_ de .claude/settings.local.json)
const fs = require('fs')
const TOK = fs.readFileSync('C:/Users/Alex/Desktop/Claude Code/.claude/settings.local.json', 'utf8').match(/sbp_881cc5[a-f0-9]+/)[0]
const ORIGEN = 'zwyttylnpqofwgbcnbyx', CRM = 'ouhikbqtwadppsuspsst'

async function sql(ref, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const t = await r.text()
  if (r.status >= 300) throw new Error(`${ref} ${r.status}: ${t.slice(0, 500)}`)
  return JSON.parse(t)
}
const lit = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

;(async () => {
  const ctwa = await sql(ORIGEN, 'select phone, ctwa_clid, source_id, headline, first_seen, last_seen from ctwa_leads')
  const frio = await sql(ORIGEN, 'select phone, nombre, msg_count, last_message_at, created_at, opt_out, intencion_at from cold_leads_tracking')
  const citas = await sql(ORIGEN, 'select phone, nombre, servicio, start_at, confirmada, asistio, inscrito, reminder_24h_sent, created_at from appointments')
  const chats = await sql(ORIGEN, 'select id, session_id, message from n8n_chat_histories order by id')

  // 1) leads: unión por teléfono
  const L = {}
  const lead = p => (L[p] ||= { telefono: p, fuente: 'organico', mensajes: 0 })
  for (const c of ctwa) Object.assign(lead(c.phone), { fuente: 'anuncio', ctwa_clid: c.ctwa_clid, anuncio_id: c.source_id,
    anuncio_titulo: c.headline, primer_mensaje: c.first_seen, ultimo_mensaje: c.last_seen })
  for (const f of frio) {
    const l = lead(f.phone)
    l.nombre ||= f.nombre; l.mensajes = f.msg_count || 0; l.opt_out = !!f.opt_out; l.interes_visita_at = f.intencion_at
    if (!l.primer_mensaje || f.created_at < l.primer_mensaje) l.primer_mensaje = f.created_at
    if (!l.ultimo_mensaje || f.last_message_at > l.ultimo_mensaje) l.ultimo_mensaje = f.last_message_at
  }
  for (const c of citas) {
    const l = lead(c.phone); l.nombre ||= c.nombre
    l.estado = c.inscrito ? 'inscrita' : (l.estado === 'inscrita' ? 'inscrita' : 'cita')
    if (!l.primer_mensaje || c.created_at < l.primer_mensaje) l.primer_mensaje = c.created_at
  }
  for (const l of Object.values(L)) l.estado ||= l.mensajes > 1 ? 'platicando' : 'nuevo'
  const leads = Object.values(L)
  await sql(CRM, `insert into public.leads (telefono, nombre, fuente, ctwa_clid, anuncio_id, anuncio_titulo, estado, opt_out, mensajes,
      primer_mensaje, ultimo_mensaje, interes_visita_at)
    select telefono, nombre, fuente, ctwa_clid, anuncio_id, anuncio_titulo, estado, coalesce(opt_out, false), coalesce(mensajes, 0),
      coalesce(primer_mensaje, now()), ultimo_mensaje, interes_visita_at
    from jsonb_to_recordset(${lit(leads)}) as x(telefono text, nombre text, fuente text, ctwa_clid text, anuncio_id text, anuncio_titulo text,
      estado text, opt_out boolean, mensajes int, primer_mensaje timestamptz, ultimo_mensaje timestamptz, interes_visita_at timestamptz)
    on conflict (telefono) do update set nombre = coalesce(leads.nombre, excluded.nombre), fuente = excluded.fuente,
      ctwa_clid = coalesce(excluded.ctwa_clid, leads.ctwa_clid), anuncio_id = coalesce(excluded.anuncio_id, leads.anuncio_id),
      anuncio_titulo = coalesce(excluded.anuncio_titulo, leads.anuncio_titulo), estado = excluded.estado, opt_out = excluded.opt_out,
      mensajes = greatest(leads.mensajes, excluded.mensajes), primer_mensaje = least(leads.primer_mensaje, excluded.primer_mensaje),
      ultimo_mensaje = greatest(leads.ultimo_mensaje, excluded.ultimo_mensaje), interes_visita_at = coalesce(leads.interes_visita_at, excluded.interes_visita_at)`)

  // 2) citas históricas (30 min cada una, como en el sistema de n8n)
  const estadoCita = c => c.asistio === true ? 'llego' : c.asistio === false ? 'no_llego'
    : new Date(c.start_at) > new Date() ? (c.confirmada ? 'confirmada' : 'agendada') : 'sin_registro'
  const cs = citas.map(c => ({ telefono: c.phone, inicio: c.start_at, modalidad: c.servicio, estado: estadoCita(c),
    confirmada: !!c.confirmada, recordatorio: c.reminder_24h_sent, created_at: c.created_at }))
  await sql(CRM, `delete from public.citas where origen = 'historico';
    insert into public.citas (lead_id, inicio, fin, modalidad, estado, origen, confirmada_at, recordatorio_24h_at, llego_at, created_at)
    select l.id, x.inicio, x.inicio + interval '30 minutes', x.modalidad, x.estado, 'historico',
      case when x.confirmada then x.inicio end, case when x.recordatorio then x.inicio - interval '24 hours' end,
      case when x.estado = 'llego' then x.inicio end, x.created_at
    from jsonb_to_recordset(${lit(cs)}) as x(telefono text, inicio timestamptz, modalidad text, estado text, confirmada boolean,
      recordatorio boolean, created_at timestamptz)
    join public.leads l on l.telefono = x.telefono`)

  // 3) memoria del chat (n8n no guarda la hora: se conserva el orden con segundos consecutivos)
  const msgs = chats.filter(m => m.message && ['human', 'ai'].includes(m.message.type))
    .map((m, i) => ({ telefono: m.session_id, rol: m.message.type === 'human' ? 'user' : 'assistant',
      contenido: { texto: m.message.content }, orden: i }))
  await sql(CRM, 'delete from public.chat_mensajes where (contenido->>\'historico\') = \'1\'')
  for (let i = 0; i < msgs.length; i += 300) {
    const parte = msgs.slice(i, i + 300)
    await sql(CRM, `insert into public.chat_mensajes (lead_id, telefono, rol, contenido, created_at)
      select l.id, x.telefono, x.rol, x.contenido || '{"historico":"1"}'::jsonb, timestamptz '2026-11-01' + x.orden * interval '1 second'
      from jsonb_to_recordset(${lit(parte)}) as x(telefono text, rol text, contenido jsonb, orden int)
      left join public.leads l on l.telefono = x.telefono`)
  }
  const res = await sql(CRM, `select (select count(*) from public.leads) leads, (select count(*) from public.leads where fuente='anuncio') de_anuncio,
    (select count(*) from public.citas) citas, (select count(*) from public.chat_mensajes) mensajes,
    (select json_object_agg(estado, n) from (select estado, count(*) n from public.citas group by estado) s) citas_por_estado`)
  console.log('Origen:', { ctwa: ctwa.length, seguimiento: frio.length, citas: citas.length, chats: chats.length })
  console.log('CRM:', res[0])
})().catch(e => { console.error(e.message); process.exit(1) })
