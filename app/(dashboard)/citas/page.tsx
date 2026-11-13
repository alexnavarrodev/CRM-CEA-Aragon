'use client'

// Citas de visita al plantel que agenda el agente de WhatsApp (o Alex a mano).
// Aquí se marca quién llegó: eso dispara el evento «Asistió» para Meta (disparador en la BD).
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hoyMX } from '@/lib/fecha'
import { useBackdropClose } from '@/lib/useBackdropClose'
import { ChevronLeft, ChevronRight, Plus, X, MessageCircle, CheckCircle2, XCircle, Clock, CalendarClock } from 'lucide-react'

type Estado = 'agendada' | 'confirmada' | 'llego' | 'no_llego' | 'cancelada' | 'reagendada' | 'sin_registro'
type Cita = {
  id: string; inicio: string; fin: string; modalidad: string | null; estado: Estado; origen: string
  recordatorio_24h_at: string | null; notas: string | null
  leads: { id: string; nombre: string | null; telefono: string; anuncio_titulo: string | null }
}

const ESTADOS: Record<Estado, { label: string; clase: string }> = {
  agendada:     { label: 'Sin confirmar', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmada:   { label: 'Confirmada',    clase: 'bg-blue-50 text-blue-700 border-blue-200' },
  llego:        { label: 'Llegó',         clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  no_llego:     { label: 'No llegó',      clase: 'bg-red-50 text-red-600 border-red-200' },
  cancelada:    { label: 'Cancelada',     clase: 'bg-slate-100 text-slate-500 border-slate-200' },
  reagendada:   { label: 'Reagendada',    clase: 'bg-slate-100 text-slate-500 border-slate-200' },
  sin_registro: { label: 'Sin registro',  clase: 'bg-slate-100 text-slate-500 border-slate-200' },
}
const MODALIDADES = ['Auxiliar de Enfermería', 'Auxiliar de Enfermería + Bachillerato']
const DURACION_MIN = 30

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
const sumarDias = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
const fechaTexto = (f: string) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3600000).toISOString().slice(0, 10)

export default function CitasPage() {
  const [fecha, setFecha] = useState(hoyMX())
  const [vista, setVista] = useState<'proximas' | 'dia' | 'semana'>('proximas')
  const semana = vista === 'semana'
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Cita | 'nueva' | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('citas')
      .select('id, inicio, fin, modalidad, estado, origen, recordatorio_24h_at, notas, leads!inner(id, nombre, telefono, anuncio_titulo)')
      .not('estado', 'in', '(cancelada,reagendada)').order('inicio')
    q = vista === 'proximas'
      ? q.gte('inicio', `${hoyMX()}T00:00:00-06:00`).limit(300)                     // de hoy en adelante, sin límite de días
      : q.gte('inicio', `${fecha}T00:00:00-06:00`).lt('inicio', `${sumarDias(fecha, semana ? 7 : 1)}T00:00:00-06:00`)
    const { data } = await q
    setCitas((data ?? []) as unknown as Cita[])
    setLoading(false)
  }, [fecha, vista])

  useEffect(() => { load() }, [load])

  const cambiarEstado = async (c: Cita, estado: Estado) => {
    const { error } = await supabase.from('citas').update({ estado }).eq('id', c.id)
    if (error) return alert('No se pudo guardar: ' + error.message)
    setCitas(prev => prev.map(x => x.id === c.id ? { ...x, estado } : x))
  }

  const activas = citas.filter(c => c.estado !== 'sin_registro')
  const resumen = {
    total: activas.length,
    confirmadas: activas.filter(c => c.estado === 'confirmada').length,
    sinConfirmar: activas.filter(c => c.estado === 'agendada').length,
    llegaron: activas.filter(c => c.estado === 'llego').length,
  }
  const porDia = citas.reduce<Record<string, Cita[]>>((acc, c) => { (acc[diaDe(c.inicio)] ||= []).push(c); return acc }, {})

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Citas</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {resumen.total} citas · {resumen.confirmadas} confirmadas · {resumen.sinConfirmar} sin confirmar · {resumen.llegaron} llegaron
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
              {([['proximas', 'Próximas'], ['dia', 'Día'], ['semana', '7 días']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setVista(v)} className={`px-3 py-2 ${vista === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
              ))}
            </div>
            {vista !== 'proximas' && <>
              <button onClick={() => setFecha(sumarDias(fecha, semana ? -7 : -1))} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setFecha(hoyMX())} className="px-3 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50">Hoy</button>
              <button onClick={() => setFecha(sumarDias(fecha, semana ? 7 : 1))} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
            </>}
            <input type="date" title="Ir a una fecha" value={vista === 'proximas' ? '' : fecha}
              onChange={e => { if (e.target.value) { setFecha(e.target.value); if (vista === 'proximas') setVista('dia') } }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50" />
            <button onClick={() => setModal('nueva')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus className="w-4 h-4" /> Nueva cita
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : citas.length === 0 ? (
          <div className="text-center py-16 text-slate-400">No hay citas {vista === 'proximas' ? 'próximas' : semana ? 'en estos 7 días' : `el ${fechaTexto(fecha)}`}.</div>
        ) : Object.entries(porDia).map(([dia, lista]) => (
          <section key={dia}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{fechaTexto(dia)}</h2>
            <div className="space-y-2">
              {lista.map(c => <CitaFila key={c.id} cita={c} onEstado={cambiarEstado} onEditar={() => setModal(c)} />)}
            </div>
          </section>
        ))}
      </div>

      {modal !== null && (
        <CitaModal cita={modal === 'nueva' ? null : modal} fechaInicial={fecha}
          onClose={() => setModal(null)} onGuardado={() => { setModal(null); load() }} />
      )}
    </div>
  )
}

function CitaFila({ cita, onEstado, onEditar }: { cita: Cita; onEstado: (c: Cita, e: Estado) => void; onEditar: () => void }) {
  const est = ESTADOS[cita.estado]
  const pasada = new Date(cita.inicio).getTime() < Date.now()
  const abierta = cita.estado === 'agendada' || cita.estado === 'confirmada'
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 flex-wrap">
      <div className="w-16 text-center">
        <p className="text-lg font-bold text-slate-900">{hora(cita.inicio)}</p>
      </div>
      <div className="flex-1 min-w-48 cursor-pointer" onClick={onEditar}>
        <p className="font-medium text-slate-800">{cita.leads.nombre || 'Sin nombre'}</p>
        <p className="text-xs text-slate-500">{cita.modalidad || 'Modalidad sin indicar'}{cita.leads.anuncio_titulo ? ` · Anuncio: ${cita.leads.anuncio_titulo}` : ''}</p>
        {cita.notas && <p className="text-xs text-slate-400 mt-0.5">{cita.notas}</p>}
      </div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${est.clase}`}>{est.label}</span>
      {abierta && !cita.recordatorio_24h_at && <span title="Aún no se envía el recordatorio de 24 h"><Clock className="w-4 h-4 text-slate-300" /></span>}
      <div className="flex items-center gap-1.5">
        <a href={`https://wa.me/${cita.leads.telefono}`} target="_blank" rel="noreferrer" title="Escribir por WhatsApp"
          className="p-2 rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50"><MessageCircle className="w-4 h-4" /></a>
        {(abierta || cita.estado === 'no_llego') && pasada && (
          <button onClick={() => onEstado(cita, 'llego')} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Llegó
          </button>
        )}
        {abierta && pasada && (
          <button onClick={() => onEstado(cita, 'no_llego')} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50">
            <XCircle className="w-4 h-4" /> No llegó
          </button>
        )}
        {abierta && !pasada && (
          <button onClick={onEditar} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
            <CalendarClock className="w-4 h-4" /> Cambiar
          </button>
        )}
      </div>
    </div>
  )
}

function CitaModal({ cita, fechaInicial, onClose, onGuardado }: {
  cita: Cita | null; fechaInicial: string; onClose: () => void; onGuardado: () => void
}) {
  const supabase = createClient()
  const [nombre, setNombre] = useState(cita?.leads.nombre ?? '')
  const [telefono, setTelefono] = useState(cita?.leads.telefono ?? '')
  const [fecha, setFecha] = useState(cita ? diaDe(cita.inicio) : fechaInicial)
  const [horaInicio, setHoraInicio] = useState(cita ? hora(cita.inicio) : '10:00')
  const [modalidad, setModalidad] = useState(cita?.modalidad ?? MODALIDADES[0])
  const [notas, setNotas] = useState(cita?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const backdrop = useBackdropClose(onClose)

  const guardar = async () => {
    const inicio = new Date(`${fecha}T${horaInicio}:00-06:00`)
    const fin = new Date(inicio.getTime() + DURACION_MIN * 60000)
    setGuardando(true)
    try {
      if (cita) {
        const cambioHora = inicio.toISOString() !== new Date(cita.inicio).toISOString()
        const { error } = await supabase.from('citas').update({
          inicio: inicio.toISOString(), fin: fin.toISOString(), modalidad, notas: notas || null,
          ...(cambioHora ? { estado: 'agendada', confirmada_at: null, recordatorio_24h_at: null, aviso_sin_confirmar_at: null } : {}),
        }).eq('id', cita.id)
        if (error) throw error
        if (nombre !== cita.leads.nombre) await supabase.from('leads').update({ nombre }).eq('id', cita.leads.id)
      } else {
        // Teléfono en formato de WhatsApp de México: 521 + 10 dígitos
        const d = telefono.replace(/\D/g, '').slice(-10)
        if (d.length !== 10) throw new Error('El teléfono debe tener 10 dígitos')
        const tel = '521' + d
        // Si ya escribió por WhatsApp se usa su lead (conserva el anuncio de origen); si no, se crea uno manual
        const { data: previo } = await supabase.from('leads').select('id, nombre').eq('telefono', tel).maybeSingle()
        const { data: lead, error: e1 } = previo
          ? await supabase.from('leads').update({ estado: 'cita', ...(nombre && !previo.nombre ? { nombre } : {}) }).eq('id', previo.id).select('id').single()
          : await supabase.from('leads').insert({ telefono: tel, nombre: nombre || null, fuente: 'manual', estado: 'cita' }).select('id').single()
        if (e1 || !lead) throw e1 ?? new Error('No se pudo crear el contacto')
        const { error } = await supabase.from('citas').insert({ lead_id: lead.id, inicio: inicio.toISOString(), fin: fin.toISOString(), modalidad, notas: notas || null, origen: 'crm' })
        if (error) throw error
      }
      onGuardado()
    } catch (e) {
      const m = (e as { code?: string; message?: string })
      alert(m.code === '23505' ? 'Esa hora ya está ocupada o la persona ya tiene una cita activa.' : 'No se pudo guardar: ' + m.message)
    } finally { setGuardando(false) }
  }

  const cancelar = async () => {
    if (!cita || !confirm('¿Cancelar esta cita?')) return
    await supabase.from('citas').update({ estado: 'cancelada', notas: (notas ? notas + ' · ' : '') + 'Cancelada desde el CRM' }).eq('id', cita.id)
    onGuardado()
  }

  const input = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{cita ? 'Editar cita' : 'Nueva cita'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">WhatsApp</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} disabled={!!cita} placeholder="55 1234 5678" className={input + ' disabled:bg-slate-50'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Día</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Hora</label>
              <input type="time" step={1800} value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Modalidad</label>
            <select value={modalidad} onChange={e => setModalidad(e.target.value)} className={input + ' bg-white'}>
              {MODALIDADES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className={input + ' resize-none'} />
          </div>
          {cita && <p className="text-xs text-slate-400">Si cambias el día o la hora, la cita vuelve a «Sin confirmar» y se le manda de nuevo el recordatorio de 24 h.</p>}
          <div className="flex gap-3 pt-1">
            {cita && (cita.estado === 'agendada' || cita.estado === 'confirmada') && (
              <button onClick={cancelar} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition">Cancelar cita</button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cerrar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60">
              {guardando ? 'Guardando…' : cita ? 'Guardar' : 'Agendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
