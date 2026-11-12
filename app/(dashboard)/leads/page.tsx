'use client'

// Leads de WhatsApp (los registra el agente) y embudo por anuncio: mensajes → citas → llegaron → inscritas.
// «Inscrita» se marca sola cuando se da de alta una alumna con el mismo teléfono (disparador en la BD).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBackdropClose } from '@/lib/useBackdropClose'
import { Search, MessageCircle, X, Megaphone } from 'lucide-react'

type EstadoLead = 'nuevo' | 'platicando' | 'cita' | 'inscrita' | 'descartado'
type Lead = {
  id: string; nombre: string | null; telefono: string; fuente: string; anuncio_id: string | null; anuncio_titulo: string | null
  estado: EstadoLead; mensajes: number; primer_mensaje: string; ultimo_mensaje: string | null; alumna_id: string | null; notas: string | null
}
type CitaMin = { lead_id: string; estado: string; inicio: string }

const ESTADOS: Record<EstadoLead, { label: string; clase: string }> = {
  nuevo:      { label: 'Nuevo',      clase: 'bg-slate-100 text-slate-600' },
  platicando: { label: 'Platicando', clase: 'bg-sky-50 text-sky-700' },
  cita:       { label: 'Con cita',   clase: 'bg-amber-50 text-amber-700' },
  inscrita:   { label: 'Inscrita',   clase: 'bg-emerald-50 text-emerald-700' },
  descartado: { label: 'Descartado', clase: 'bg-red-50 text-red-600' },
}
const PERIODOS = [{ v: 30, label: 'Últimos 30 días' }, { v: 90, label: 'Últimos 90 días' }, { v: 0, label: 'Todo' }]
const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' }) : '—'
const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : '—'
const telVisible = (t: string) => t.slice(-10).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')

export default function LeadsPage() {
  const supabase = createClient()
  const [leads, setLeads] = useState<Lead[]>([])
  const [citas, setCitas] = useState<CitaMin[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState(30)
  const [fuente, setFuente] = useState('todas')
  const [estado, setEstado] = useState<'todos' | EstadoLead>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<Lead | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('leads').select('id, nombre, telefono, fuente, anuncio_id, anuncio_titulo, estado, mensajes, primer_mensaje, ultimo_mensaje, alumna_id, notas')
      .order('primer_mensaje', { ascending: false }).range(0, 4999)
    if (periodo) q = q.gte('primer_mensaje', new Date(Date.now() - periodo * 86400000).toISOString())
    const [{ data: l }, { data: c }] = await Promise.all([q, supabase.from('citas').select('lead_id, estado, inicio').range(0, 4999)])
    setLeads((l ?? []) as Lead[]); setCitas((c ?? []) as CitaMin[]); setLoading(false)
  }, [periodo])
  useEffect(() => { load() }, [load])

  // Por lead: ¿tuvo cita? ¿llegó a alguna?
  const porLead = useMemo(() => {
    const m: Record<string, { cita: boolean; llego: boolean }> = {}
    for (const c of citas) {
      const x = (m[c.lead_id] ||= { cita: false, llego: false })
      if (c.estado !== 'cancelada') x.cita = true
      if (c.estado === 'llego') x.llego = true
    }
    return m
  }, [citas])

  const delPeriodo = leads.filter(l => fuente === 'todas' || l.fuente === fuente)
  const embudo = (ls: Lead[]) => ({
    leads: ls.length,
    platicaron: ls.filter(l => l.mensajes >= 2 || l.estado !== 'nuevo').length,
    citas: ls.filter(l => porLead[l.id]?.cita).length,
    llegaron: ls.filter(l => porLead[l.id]?.llego).length,
    inscritas: ls.filter(l => l.estado === 'inscrita' || l.alumna_id).length,
  })
  const total = embudo(delPeriodo)

  const anuncios = useMemo(() => {
    const g: Record<string, Lead[]> = {}
    for (const l of leads.filter(l => l.fuente === 'anuncio')) (g[l.anuncio_id || l.anuncio_titulo || '?'] ||= []).push(l)
    return Object.entries(g).map(([id, ls]) => ({ id, titulo: ls.find(l => l.anuncio_titulo)?.anuncio_titulo || `Anuncio ${id}`, ...embudo(ls) }))
      .sort((a, b) => b.leads - a.leads)
  }, [leads, porLead])

  const lista = delPeriodo.filter(l => (estado === 'todos' || l.estado === estado) &&
    (!busqueda || (l.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase()) || l.telefono.includes(busqueda.replace(/\D/g, '') || '§')))

  const guardar = async (l: Lead, cambios: Partial<Lead>) => {
    const { error } = await supabase.from('leads').update(cambios).eq('id', l.id)
    if (error) return alert('No se pudo guardar: ' + error.message)
    setLeads(prev => prev.map(x => x.id === l.id ? { ...x, ...cambios } : x))
    setAbierto(null)
  }

  const sel = 'px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads de WhatsApp</h1>
          <p className="text-sm text-slate-400 mt-0.5">Quién escribe, de qué anuncio viene y hasta dónde llega.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={periodo} onChange={e => setPeriodo(Number(e.target.value))} className={sel}>
            {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
          <select value={fuente} onChange={e => setFuente(e.target.value)} className={sel}>
            <option value="todas">Todas las fuentes</option><option value="anuncio">Anuncios</option>
            <option value="organico">Orgánico</option><option value="manual">Agregados a mano</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? <div className="text-center py-16 text-slate-400">Cargando...</div> : <>
          {/* Embudo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([['Escribieron', total.leads, null], ['Platicaron', total.platicaron, total.leads], ['Agendaron cita', total.citas, total.platicaron],
              ['Llegaron', total.llegaron, total.citas], ['Se inscribieron', total.inscritas, total.llegaron]] as [string, number, number | null][]).map(([label, n, base]) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-900">{n}</p>
                {base !== null && <p className="text-xs text-slate-400">{pct(n, base)} del paso anterior</p>}
              </div>
            ))}
          </div>

          {/* Por anuncio */}
          {anuncios.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-900 px-5 py-4 border-b border-slate-100 flex items-center gap-2"><Megaphone className="w-4 h-4" /> Por anuncio</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                    <th className="text-left px-5 py-2 font-medium">Anuncio</th><th className="px-3 py-2 font-medium">Leads</th>
                    <th className="px-3 py-2 font-medium">Citas</th><th className="px-3 py-2 font-medium">Llegaron</th>
                    <th className="px-3 py-2 font-medium">Inscritas</th><th className="px-3 py-2 font-medium">Lead → inscrita</th>
                  </tr></thead>
                  <tbody>{anuncios.map(a => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-5 py-2.5 text-slate-800 max-w-md truncate" title={a.titulo}>
                        {a.titulo} <span className="text-xs text-slate-400">· …{a.id.slice(-6)}</span>
                      </td>
                      <td className="text-center">{a.leads}</td><td className="text-center">{a.citas}</td>
                      <td className="text-center">{a.llegaron}</td><td className="text-center font-semibold text-emerald-700">{a.inscritas}</td>
                      <td className="text-center text-slate-500">{pct(a.inscritas, a.leads)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

          {/* Lista */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-slate-900 mr-auto">{lista.length} leads</h2>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre o teléfono" className={sel + ' pl-9 w-56'} />
              </div>
              <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} className={sel}>
                <option value="todos">Todos los estados</option>
                {(Object.keys(ESTADOS) as EstadoLead[]).map(s => <option key={s} value={s}>{ESTADOS[s].label}</option>)}
              </select>
            </div>
            <div className="divide-y divide-slate-100">
              {lista.slice(0, 300).map(l => (
                <div key={l.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 cursor-pointer" onClick={() => setAbierto(l)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{l.nombre || 'Sin nombre'} <span className="text-slate-400 font-normal text-sm">· {telVisible(l.telefono)}</span></p>
                    <p className="text-xs text-slate-500 truncate">{l.fuente === 'anuncio' ? `Anuncio: ${l.anuncio_titulo || l.anuncio_id}` : l.fuente === 'manual' ? 'Agregado a mano' : 'Orgánico'} · {l.mensajes} mensajes</p>
                  </div>
                  <span className="text-xs text-slate-400 w-16 text-right">{fecha(l.ultimo_mensaje || l.primer_mensaje)}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-24 text-center ${ESTADOS[l.estado].clase}`}>{ESTADOS[l.estado].label}</span>
                  <a href={`https://wa.me/${l.telefono}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Escribir por WhatsApp"
                    className="p-2 rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50"><MessageCircle className="w-4 h-4" /></a>
                </div>
              ))}
              {lista.length > 300 && <p className="px-5 py-3 text-xs text-slate-400">Se muestran los 300 más recientes. Usa la búsqueda o los filtros para ver los demás.</p>}
              {lista.length === 0 && <p className="px-5 py-10 text-center text-slate-400">No hay leads con estos filtros.</p>}
            </div>
          </section>
        </>}
      </div>

      {abierto && <LeadModal lead={abierto} onClose={() => setAbierto(null)} onGuardar={guardar} />}
    </div>
  )
}

function LeadModal({ lead, onClose, onGuardar }: { lead: Lead; onClose: () => void; onGuardar: (l: Lead, c: Partial<Lead>) => void }) {
  const [nombre, setNombre] = useState(lead.nombre ?? '')
  const [estado, setEstado] = useState<EstadoLead>(lead.estado)
  const [notas, setNotas] = useState(lead.notas ?? '')
  const backdrop = useBackdropClose(onClose)
  const input = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{lead.nombre || telVisible(lead.telefono)}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500">
            Primer mensaje: {fecha(lead.primer_mensaje)} · {lead.mensajes} mensajes
            {lead.anuncio_titulo ? ` · Anuncio: ${lead.anuncio_titulo}` : ''}{lead.alumna_id ? ' · Ya es alumna' : ''}
          </p>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className={input} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value as EstadoLead)} className={input + ' bg-white'}>
              {(Object.keys(ESTADOS) as EstadoLead[]).map(s => <option key={s} value={s}>{ESTADOS[s].label}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} className={input + ' resize-none'} /></div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cerrar</button>
            <button onClick={() => onGuardar(lead, { nombre: nombre || null, estado, notas: notas || null })}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
