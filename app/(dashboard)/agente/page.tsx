'use client'

// Ajustes del agente de WhatsApp: lo que cambia seguido (grupo que se ofrece, promoción, precios, horario de
// citas). El agente lee esta tabla (agente_config) en cada mensaje, así que los cambios aplican al instante.
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { hoyMX } from '@/lib/fecha'
import { Save, Plus, X, Bot, Send, RotateCcw } from 'lucide-react'

type Grupo = { nombre: string; horario: string; inicio: string | null }
type Config = {
  grupo_principal: Grupo
  grupo_alternativo: Grupo | null
  promocion: { activa: boolean; nombre: string; texto: string; fin: string | null } | null
  precios: Record<string, number>
  horario_citas: Record<string, [string, string]>
  duracion_cita_min: number
  tolerancia_min: number
  dias_bloqueados: string[]
}

const DIAS: [string, string][] = [['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'], ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']]
const PRECIOS: [string, string][] = [['inscripcion', 'Inscripción'], ['colegiatura_auxiliar', 'Colegiatura Auxiliar (mensual)'],
  ['colegiatura_auxiliar_bachillerato', 'Colegiatura Auxiliar + Bachillerato (mensual)'], ['uniformes', 'Uniformes'],
  ['certificado', 'Certificado RED CONOCER / SEP'], ['curso_rcp', 'Curso RCP / Primeros Auxilios'], ['curso_heridas', 'Curso El ABC de las Heridas']]
const input = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AgentePage() {
  const supabase = createClient()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [guardado, setGuardado] = useState('')
  const [nuevoBloqueo, setNuevoBloqueo] = useState('')

  useEffect(() => {
    supabase.from('agente_config').select('datos').limit(1).maybeSingle().then(({ data }) => setCfg(data?.datos as Config ?? null))
  }, [])

  if (!cfg) return <div className="p-10 text-center text-slate-400">Cargando...</div>
  const set = (cambio: Partial<Config>) => { setCfg({ ...cfg, ...cambio }); setGuardado('') }

  const guardar = async () => {
    const { error } = await supabase.from('agente_config').update({ datos: cfg, updated_at: new Date().toISOString() }).not('user_id', 'is', null)
    setGuardado(error ? 'Error: ' + error.message : 'Guardado ✓ El agente ya usa estos datos.')
  }

  const promoVencida = cfg.promocion?.activa && cfg.promocion.fin && cfg.promocion.fin < hoyMX()

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Bot className="w-6 h-6" /> Agente de WhatsApp</h1>
          <p className="text-sm text-slate-400 mt-0.5">Lo que dice el agente sobre grupos, promoción, precios y citas. Los cambios aplican al instante.</p>
        </div>
        <div className="flex items-center gap-3">
          {guardado && <span className={`text-sm ${guardado.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>{guardado}</span>}
          <button onClick={guardar} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 grid gap-6 lg:grid-cols-2 items-start">
        <Tarjeta titulo="Grupo que se ofrece">
          <GrupoForm g={cfg.grupo_principal} onChange={g => set({ grupo_principal: g })} />
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-4">
            <input type="checkbox" checked={!!cfg.grupo_alternativo}
              onChange={e => set({ grupo_alternativo: e.target.checked ? { nombre: '', horario: '', inicio: null } : null })} />
            Ofrecer un grupo alternativo si el principal no le acomoda
          </label>
          {cfg.grupo_alternativo && <div className="mt-3"><GrupoForm g={cfg.grupo_alternativo} onChange={g => set({ grupo_alternativo: g })} /></div>}
        </Tarjeta>

        <Tarjeta titulo="Promoción">
          <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
            <input type="checkbox" checked={!!cfg.promocion?.activa}
              onChange={e => set({ promocion: { nombre: '', texto: '', fin: null, ...cfg.promocion, activa: e.target.checked } })} />
            Promoción activa
          </label>
          {cfg.promocion?.activa && (
            <div className="space-y-3">
              <Campo label="Nombre"><input className={input} value={cfg.promocion.nombre} onChange={e => set({ promocion: { ...cfg.promocion!, nombre: e.target.value } })} /></Campo>
              <Campo label="Qué incluye (tal cual lo dirá el agente)">
                <textarea rows={2} className={input + ' resize-none'} value={cfg.promocion.texto} onChange={e => set({ promocion: { ...cfg.promocion!, texto: e.target.value } })} />
              </Campo>
              <Campo label="Válida hasta (se apaga sola después de esta fecha)">
                <input type="date" className={input} value={cfg.promocion.fin ?? ''} onChange={e => set({ promocion: { ...cfg.promocion!, fin: e.target.value || null } })} />
              </Campo>
              {promoVencida && <p className="text-xs text-amber-600">Esta fecha ya pasó: el agente ya no la menciona.</p>}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Precios">
          <div className="space-y-2">
            {PRECIOS.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-700">{label}</span>
                <div className="flex items-center gap-1 w-32">
                  <span className="text-slate-400 text-sm">$</span>
                  <input type="number" min={0} className={input} value={cfg.precios[k] ?? 0}
                    onChange={e => set({ precios: { ...cfg.precios, [k]: Number(e.target.value) } })} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">Recuerda: los precios también viven en el CRM (cobros) y en las publicaciones de redes.</p>
        </Tarjeta>

        <Tarjeta titulo="Horario de citas">
          <div className="space-y-2">
            {DIAS.map(([k, label]) => {
              const r = cfg.horario_citas[k]
              return (
                <div key={k} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 w-28">
                    <input type="checkbox" checked={!!r} onChange={e => {
                      const h = { ...cfg.horario_citas }
                      if (e.target.checked) h[k] = ['09:00', '14:00']; else delete h[k]
                      set({ horario_citas: h })
                    }} /> {label}
                  </label>
                  {r && <>
                    <input type="time" className={input + ' w-32'} value={r[0]} onChange={e => set({ horario_citas: { ...cfg.horario_citas, [k]: [e.target.value, r[1]] } })} />
                    <span className="text-slate-400 text-sm">a</span>
                    <input type="time" className={input + ' w-32'} value={r[1]} onChange={e => set({ horario_citas: { ...cfg.horario_citas, [k]: [r[0], e.target.value] } })} />
                  </>}
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Campo label="Duración de cada cita (min)"><input type="number" min={15} step={15} className={input} value={cfg.duracion_cita_min} onChange={e => set({ duracion_cita_min: Number(e.target.value) })} /></Campo>
            <Campo label="Tolerancia de llegada (min)"><input type="number" min={0} step={5} className={input} value={cfg.tolerancia_min} onChange={e => set({ tolerancia_min: Number(e.target.value) })} /></Campo>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Días sin citas (vacaciones, días festivos…)</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {cfg.dias_bloqueados.map(d => (
                <span key={d} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-sm text-slate-700">
                  {new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}
                  <button onClick={() => set({ dias_bloqueados: cfg.dias_bloqueados.filter(x => x !== d) })}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="date" className={input + ' w-44'} value={nuevoBloqueo} onChange={e => setNuevoBloqueo(e.target.value)} />
              <button onClick={() => { if (nuevoBloqueo && !cfg.dias_bloqueados.includes(nuevoBloqueo)) set({ dias_bloqueados: [...cfg.dias_bloqueados, nuevoBloqueo].sort() }); setNuevoBloqueo('') }}
                className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50"><Plus className="w-4 h-4" /> Bloquear</button>
            </div>
          </div>
        </Tarjeta>

        <ProbarAgente />
      </div>
    </div>
  )
}

// ---------- Probar el agente: chat de prueba con la misma IA del WhatsApp ----------
const TEL_SIM = '520000000000'
type Herr = { nombre: string; args: Record<string, string>; resultado: Record<string, unknown> }
type Msg = { rol: 'user' | 'assistant' | 'error'; texto: string; herramientas?: Herr[] }

function accion(h: Herr): string | null {
  const r = h.resultado ?? {}
  if (r.error) return `⚠️ ${h.nombre}: ${r.error}`
  switch (h.nombre) {
    case 'agendar_cita': return `📅 Cita agendada: ${r.dia} a las ${r.hora}`
    case 'reagendar_cita': return `🔁 Cita cambiada a: ${r.dia} a las ${r.hora}`
    case 'cancelar_cita': return '❌ Cita cancelada'
    case 'consultar_horarios': return `🔎 Revisó las horas libres del ${r.dia}`
    case 'ver_mi_cita': return '🔎 Buscó su cita'
    case 'pasar_con_asesor': return '🙋 Pasó la conversación a un asesor (la IA dejaría de responder)'
    case 'actualizar_nombre': return `📝 Guardó el nombre: ${h.args?.nombre}`
    case 'registrar_interes_visita': return '📍 Anotó que visitará el plantel sin cita'
    default: return null
  }
}

function ProbarAgente() {
  const supabase = createClient()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('chat_mensajes').select('rol, contenido').eq('telefono', TEL_SIM).order('created_at').order('id')
      .then(({ data }) => setMsgs((data ?? []).map((m: { rol: string; contenido: { texto?: string; herramientas?: Herr[] } }) =>
        ({ rol: m.rol === 'user' ? 'user' : 'assistant', texto: m.contenido.texto ?? '', herramientas: m.contenido.herramientas }))))
  }, [])
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [msgs, enviando])

  const llamar = async (cuerpo: object) => {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agente?simular=1`, {
      method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    return r.json().catch(() => ({ error: `Error ${r.status}` }))
  }

  const enviar = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    setTexto(''); setEnviando(true)
    setMsgs(m => [...m, { rol: 'user', texto: t }])
    const r = await llamar({ texto: t })
    setMsgs(m => [...m, r.error ? { rol: 'error', texto: r.error } : { rol: 'assistant', texto: r.respuesta || '(sin respuesta)', herramientas: r.herramientas }])
    setEnviando(false)
  }

  const reiniciar = async () => {
    if (!confirm('¿Empezar de nuevo? Se borra esta conversación de prueba y las citas que se hayan creado en ella.')) return
    await llamar({ reiniciar: true })
    setMsgs([])
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-semibold text-slate-900">Probar el agente</h2>
        <button onClick={reiniciar} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
          <RotateCcw className="w-3.5 h-3.5" /> Empezar de nuevo
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Escribe como si fueras un cliente. Contesta la misma IA del WhatsApp con estos ajustes (guárdalos antes de probar).
        Las citas que agende se crean de verdad y las verás en <Link href="/citas" className="text-blue-600 hover:underline">Citas</Link> marcadas como 🧪 Prueba. No se envía nada por WhatsApp.
      </p>
      <div className="h-96 overflow-y-auto rounded-xl bg-[#efeae2] p-4 space-y-2">
        {msgs.length === 0 && <p className="text-center text-sm text-slate-500 mt-32">Escribe un mensaje para empezar, por ejemplo: «Hola, quiero información»</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.rol === 'user' ? 'items-end' : 'items-start'}`}>
            {m.herramientas?.map((h, j) => { const a = accion(h); return a && <span key={j} className="text-xs text-slate-600 bg-white/70 rounded-full px-2.5 py-0.5 mb-1">{a}</span> })}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
              m.rol === 'user' ? 'bg-[#d9fdd3] text-slate-900' : m.rol === 'error' ? 'bg-red-50 text-red-700' : 'bg-white text-slate-900'}`}>
              {m.texto}
            </div>
          </div>
        ))}
        {enviando && <div className="text-xs text-slate-500">El agente está escribiendo…</div>}
        <div ref={fin} />
      </div>
      <div className="flex gap-2 mt-3">
        <input className={input} placeholder="Escribe un mensaje…" value={texto} disabled={enviando}
          onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
        <button onClick={enviar} disabled={enviando || !texto.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          <Send className="w-4 h-4" /> Enviar
        </button>
      </div>
    </section>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"><h2 className="font-semibold text-slate-900 mb-4">{titulo}</h2>{children}</section>
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>{children}</div>
}
function GrupoForm({ g, onChange }: { g: Grupo; onChange: (g: Grupo) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Campo label="Grupo"><input className={input} value={g.nombre} placeholder="Sábado Matutino" onChange={e => onChange({ ...g, nombre: e.target.value })} /></Campo>
      <Campo label="Horario de clase"><input className={input} value={g.horario} placeholder="9:00–14:00" onChange={e => onChange({ ...g, horario: e.target.value })} /></Campo>
      <Campo label="Inicio (opcional)"><input type="date" className={input} value={g.inicio ?? ''} onChange={e => onChange({ ...g, inicio: e.target.value || null })} /></Campo>
    </div>
  )
}
