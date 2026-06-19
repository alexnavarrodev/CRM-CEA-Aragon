'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Prospecto, ProspectoStatus, PROSPECTO_ESTADOS } from '@/lib/types'
import { hoyMX } from '@/lib/fecha'
import { Plus, X, UserPlus, Phone, Mail, MessageCircle } from 'lucide-react'

const COLUMNAS: ProspectoStatus[] = ['nuevo', 'contactado', 'interesado', 'inscrito', 'no_interesado']

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [modal, setModal] = useState<Prospecto | null | 'new'>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('prospectos').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setProspectos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: Partial<Prospecto>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (modal === 'new') {
      const { data } = await supabase.from('prospectos').insert({ ...form, user_id: user.id }).select().single()
      if (data) setProspectos(prev => [data, ...prev])
    } else if (modal !== null) {
      const { data } = await supabase.from('prospectos').update(form).eq('id', modal.id).select().single()
      if (data) setProspectos(prev => prev.map(p => p.id === data.id ? data : p))
    }
    setModal(null)
  }

  const handleStatusChange = async (prospecto: Prospecto, newStatus: ProspectoStatus) => {
    const { data } = await supabase.from('prospectos').update({ status: newStatus }).eq('id', prospecto.id).select().single()
    if (data) setProspectos(prev => prev.map(p => p.id === data.id ? data : p))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este prospecto?')) return
    await supabase.from('prospectos').delete().eq('id', id)
    setProspectos(prev => prev.filter(p => p.id !== id))
    setModal(null)
  }

  const byStatus = (status: ProspectoStatus) => prospectos.filter(p => p.status === status)
  const totalActivos = prospectos.filter(p => p.status !== 'no_interesado').length

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Prospectos</h1>
            <p className="text-sm text-slate-400 mt-0.5">{totalActivos} prospectos activos</p>
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo prospecto
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : (
          <div className="flex gap-4 h-full min-h-0" style={{ minWidth: 'max-content' }}>
            {COLUMNAS.map(status => {
              const est = PROSPECTO_ESTADOS[status]
              const cards = byStatus(status)
              return (
                <div key={status} className="w-72 flex-shrink-0 flex flex-col">
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 border ${est.bg}`}>
                    <span className={`text-sm font-semibold ${est.color}`}>{est.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${est.color} bg-white/60`}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {cards.map(p => (
                      <ProspectoCard
                        key={p.id}
                        prospecto={p}
                        onClick={() => setModal(p)}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-slate-300 text-xs">Sin prospectos</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal !== null && (
        <ProspectoModal
          prospecto={modal === 'new' ? null : modal}
          onSave={handleSave}
          onDelete={modal !== 'new' ? handleDelete : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function ProspectoCard({ prospecto, onClick, onStatusChange }: {
  prospecto: Prospecto
  onClick: () => void
  onStatusChange: (p: Prospecto, s: ProspectoStatus) => void
}) {
  const siguienteEstado: Record<ProspectoStatus, ProspectoStatus | null> = {
    nuevo: 'contactado',
    contactado: 'interesado',
    interesado: 'inscrito',
    inscrito: null,
    no_interesado: null,
  }
  const sig = siguienteEstado[prospecto.status]

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 hover:shadow-md transition cursor-pointer group"
      onClick={onClick}>
      <div className="flex items-start justify-between mb-2">
        <p className="font-medium text-slate-800 text-sm leading-snug">{prospecto.nombre}</p>
        <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
          {new Date(prospecto.fecha_contacto + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      {prospecto.interes && (
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">{prospecto.interes}</p>
      )}

      <div className="flex items-center gap-2 mb-2">
        {prospecto.telefono && (
          <a href={`tel:${prospecto.telefono}`} onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition">
            <Phone className="w-3 h-3" />{prospecto.telefono}
          </a>
        )}
      </div>

      {sig && (
        <button
          onClick={e => { e.stopPropagation(); onStatusChange(prospecto, sig) }}
          className="w-full mt-1 py-1.5 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition opacity-0 group-hover:opacity-100"
        >
          Mover a {PROSPECTO_ESTADOS[sig].label} →
        </button>
      )}
    </div>
  )
}

function ProspectoModal({ prospecto, onSave, onDelete, onClose }: {
  prospecto: Prospecto | null
  onSave: (d: Partial<Prospecto>) => void
  onDelete?: (id: string) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(prospecto?.nombre ?? '')
  const [telefono, setTelefono] = useState(prospecto?.telefono ?? '')
  const [email, setEmail] = useState(prospecto?.email ?? '')
  const [interes, setInteres] = useState(prospecto?.interes ?? '')
  const [status, setStatus] = useState<ProspectoStatus>(prospecto?.status ?? 'nuevo')
  const [notas, setNotas] = useState(prospecto?.notas ?? '')
  const [fecha, setFecha] = useState(prospecto?.fecha_contacto ?? hoyMX())

  const handleSubmit = () => {
    if (!nombre.trim()) return
    onSave({ nombre: nombre.trim(), telefono: telefono || null, email: email || null, interes, status, notas: notas || null, fecha_contacto: fecha })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">{prospecto ? 'Editar prospecto' : 'Nuevo prospecto'}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del prospecto"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Interés / Programa</label>
            <input value={interes} onChange={e => setInteres(e.target.value)} placeholder="Ej: Enfermería general, turno matutino..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as ProspectoStatus)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {(Object.keys(PROSPECTO_ESTADOS) as ProspectoStatus[]).map(s => (
                  <option key={s} value={s}>{PROSPECTO_ESTADOS[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha contacto</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones sobre el prospecto..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            {prospecto && onDelete && (
              <button onClick={() => onDelete(prospecto.id)} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition">
                Eliminar
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              {prospecto ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
