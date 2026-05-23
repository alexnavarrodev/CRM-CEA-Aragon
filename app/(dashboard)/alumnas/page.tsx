'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, Grupo, AlumnaStatus, AlumnaPrograma, DIA_COLORS } from '@/lib/types'
import { Plus, X, Users, Phone, Mail, Search } from 'lucide-react'

const STATUS_STYLES: Record<AlumnaStatus, { label: string; className: string }> = {
  activa:   { label: 'Activa',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  egresada: { label: 'Egresada', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  baja:     { label: 'Baja',     className: 'bg-red-50 text-red-600 border-red-200' },
}

const PROGRAMA_LABELS: Record<AlumnaPrograma, string> = {
  colegiaturas: 'Colegiaturas',
  bachillerato: 'Bachillerato',
  ambos:        'Ambos',
}

export default function AlumnasPage() {
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoFiltro, setGrupoFiltro] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<AlumnaStatus | 'todos'>('activa')
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<Alumna | null | 'new'>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: gr }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).order('nombre'),
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
    ])
    setAlumnas(al ?? [])
    setGrupos(gr ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtradas = alumnas.filter(a => {
    if (grupoFiltro !== 'todos' && a.grupo_id !== grupoFiltro) return false
    if (statusFiltro !== 'todos' && a.status !== statusFiltro) return false
    if (busqueda && !a.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const handleSave = async (form: Partial<Alumna>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (modal === 'new') {
      const { data } = await supabase.from('alumnas').insert({ ...form, user_id: user.id }).select('*, grupo:grupos(*)').single()
      if (data) setAlumnas(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    } else if (modal !== null) {
      const { data } = await supabase.from('alumnas').update(form).eq('id', modal.id).select('*, grupo:grupos(*)').single()
      if (data) setAlumnas(prev => prev.map(a => a.id === data.id ? data : a))
    }
    setModal(null)
  }

  const handleBaja = async (alumna: Alumna) => {
    if (!confirm(`¿Dar de baja a ${alumna.nombre}?`)) return
    const { data } = await supabase.from('alumnas').update({ status: 'baja' }).eq('id', alumna.id).select('*, grupo:grupos(*)').single()
    if (data) setAlumnas(prev => prev.map(a => a.id === data.id ? data : a))
    setModal(null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Alumnas</h1>
            <p className="text-sm text-slate-400 mt-0.5">{filtradas.length} alumnas mostradas</p>
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nueva alumna
          </button>
        </div>

        {/* Group filter pills */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button onClick={() => setGrupoFiltro('todos')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${grupoFiltro === 'todos' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            Todos los grupos
          </button>
          {grupos.map(g => {
            const c = DIA_COLORS[g.dia] || { bg: '#94A3B8', text: '#fff' }
            const active = grupoFiltro === g.id
            return (
              <button key={g.id} onClick={() => setGrupoFiltro(active ? 'todos' : g.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition border"
                style={{ background: active ? c.bg : '#fff', color: active ? c.text : '#475569', borderColor: active ? c.bg : '#E2E8F0' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: c.bg }}>{g.dia}</span>
                {g.nombre}
              </button>
            )
          })}
        </div>

        {/* Status + search */}
        <div className="flex items-center gap-3">
          {(['todos', 'activa', 'egresada', 'baja'] as const).map(s => (
            <button key={s} onClick={() => setStatusFiltro(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${statusFiltro === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {s === 'todos' ? 'Todas' : STATUS_STYLES[s].label}
            </button>
          ))}
          <div className="relative ml-auto">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar alumna..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-52" />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay alumnas que coincidan</p>
            <button onClick={() => setModal('new')} className="mt-3 text-blue-600 text-sm font-medium hover:underline">+ Agregar alumna</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ALUMNA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">GRUPO</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PROGRAMA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CUOTA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PROMEDIO</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ASISTENCIA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ESTADO</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map(alumna => {
                  const g = alumna.grupo
                  const c = g ? (DIA_COLORS[g.dia] || { bg: '#94A3B8' }) : null
                  const st = STATUS_STYLES[alumna.status]
                  return (
                    <tr key={alumna.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition cursor-pointer"
                      onClick={() => setModal(alumna)}>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{alumna.nombre}</div>
                        {(alumna.telefono || alumna.email) && (
                          <div className="flex items-center gap-3 mt-0.5">
                            {alumna.telefono && <span className="flex items-center gap-1 text-xs text-slate-400"><Phone className="w-3 h-3" />{alumna.telefono}</span>}
                            {alumna.email && <span className="flex items-center gap-1 text-xs text-slate-400"><Mail className="w-3 h-3" />{alumna.email}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {g && c ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                            style={{ background: c.bg + '18', color: c.bg, borderColor: c.bg + '40' }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.bg }} />
                            {g.nombre}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">Sin grupo</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{PROGRAMA_LABELS[alumna.programa]}</td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">${Number(alumna.cuota_mensual).toLocaleString('es-MX')}</td>
                      <td className="px-5 py-3.5">
                        <span className={`font-medium ${Number(alumna.promedio) >= 8 ? 'text-emerald-600' : Number(alumna.promedio) >= 6 ? 'text-amber-600' : 'text-red-500'}`}>
                          {Number(alumna.promedio).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${Number(alumna.asistencia_pct) >= 80 ? 'bg-emerald-500' : Number(alumna.asistencia_pct) >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, Number(alumna.asistencia_pct))}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{Number(alumna.asistencia_pct)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModal(alumna)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <AlumnaModal
          alumna={modal === 'new' ? null : modal}
          grupos={grupos}
          onSave={handleSave}
          onBaja={modal !== 'new' ? handleBaja : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function AlumnaModal({ alumna, grupos, onSave, onBaja, onClose }: {
  alumna: Alumna | null; grupos: Grupo[]
  onSave: (d: Partial<Alumna>) => void
  onBaja?: (a: Alumna) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(alumna?.nombre ?? '')
  const [telefono, setTelefono] = useState(alumna?.telefono ?? '')
  const [email, setEmail] = useState(alumna?.email ?? '')
  const [grupoId, setGrupoId] = useState(alumna?.grupo_id ?? '')
  const [cuota, setCuota] = useState(alumna?.cuota_mensual?.toString() ?? '800')
  const [programa, setPrograma] = useState<AlumnaPrograma>(alumna?.programa ?? 'colegiaturas')
  const [status, setStatus] = useState<AlumnaStatus>(alumna?.status ?? 'activa')
  const [promedio, setPromedio] = useState(alumna?.promedio?.toString() ?? '8')
  const [asistencia, setAsistencia] = useState(alumna?.asistencia_pct?.toString() ?? '90')
  const [notas, setNotas] = useState(alumna?.notas ?? '')

  const handleSubmit = () => {
    if (!nombre.trim()) return
    onSave({
      nombre: nombre.trim(),
      telefono: telefono || null,
      email: email || null,
      grupo_id: grupoId || null,
      cuota_mensual: parseFloat(cuota) || 0,
      programa,
      status,
      promedio: parseFloat(promedio) || 0,
      asistencia_pct: parseFloat(asistencia) || 0,
      notas: notas || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">{alumna ? 'Editar alumna' : 'Nueva alumna'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la alumna"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="55 1234 5678"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Grupo</label>
              <select value={grupoId} onChange={e => setGrupoId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Sin grupo</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} ({g.dia})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Programa</label>
              <select value={programa} onChange={e => setPrograma(e.target.value as AlumnaPrograma)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="colegiaturas">Colegiaturas</option>
                <option value="bachillerato">Bachillerato</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cuota mensual</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                <input type="number" value={cuota} onChange={e => setCuota(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as AlumnaStatus)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="activa">Activa</option>
                <option value="egresada">Egresada</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Promedio</label>
              <input type="number" min="0" max="10" step="0.1" value={promedio} onChange={e => setPromedio(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Asistencia (%)</label>
              <input type="number" min="0" max="100" value={asistencia} onChange={e => setAsistencia(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones adicionales..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            {alumna && onBaja && alumna.status === 'activa' && (
              <button onClick={() => onBaja(alumna)} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition">
                Dar de baja
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              {alumna ? 'Guardar cambios' : 'Agregar alumna'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
