'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, DIA_COLORS } from '@/lib/types'
import { Plus, X, Trash2, UsersRound, Clock, User } from 'lucide-react'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']
const DIA_NAMES: Record<string, string> = {
  LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles',
  JUE: 'Jueves', VIE: 'Viernes', SAB: 'Sábado', DOM: 'Domingo',
}

export default function GruposPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [modal, setModal] = useState<Grupo | null | 'new'>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('grupos').select('*').eq('user_id', user.id).order('dia')
    setGrupos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: Partial<Grupo>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (modal === 'new') {
      const { data } = await supabase.from('grupos').insert({ ...form, user_id: user.id }).select().single()
      if (data) setGrupos(prev => [...prev, data])
    } else if (modal !== null) {
      const { data } = await supabase.from('grupos').update(form).eq('id', modal.id).select().single()
      if (data) setGrupos(prev => prev.map(g => g.id === data.id ? data : g))
    }
    setModal(null)
  }

  const handleDelete = async (grupo: Grupo) => {
    if (!confirm(`¿Eliminar el grupo "${grupo.nombre}"? Las alumnas quedarán sin grupo.`)) return
    await supabase.from('grupos').delete().eq('id', grupo.id)
    setGrupos(prev => prev.filter(g => g.id !== grupo.id))
    setModal(null)
  }

  // Group by day for display
  const porDia = DIAS.reduce<Record<string, Grupo[]>>((acc, dia) => {
    acc[dia] = grupos.filter(g => g.dia === dia)
    return acc
  }, {})
  const diasConGrupos = DIAS.filter(d => porDia[d].length > 0)

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Grupos</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'} registrados
            </p>
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo grupo
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : grupos.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
            <UsersRound className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm mb-2">No hay grupos creados</p>
            <button onClick={() => setModal('new')} className="text-blue-600 text-sm font-medium hover:underline">
              + Crear primer grupo
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {diasConGrupos.map(dia => {
              const c = DIA_COLORS[dia] || { bg: '#94A3B8', text: '#fff' }
              return (
                <div key={dia}>
                  {/* Day header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: c.bg }}>
                      {dia}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{DIA_NAMES[dia]}</span>
                    <div className="flex-1 border-t border-slate-100" />
                    <span className="text-xs text-slate-400">{porDia[dia].length} {porDia[dia].length === 1 ? 'grupo' : 'grupos'}</span>
                  </div>

                  {/* Group cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {porDia[dia].map(g => (
                      <div
                        key={g.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition cursor-pointer"
                        onClick={() => setModal(g)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: c.bg }}
                          >
                            {dia[0]}
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(g) }}
                            className="p-1 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h3 className="font-semibold text-slate-800 text-sm mt-2">{g.nombre}</h3>
                        <div className="mt-2 space-y-1">
                          {g.horario && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Clock className="w-3 h-3" />
                              {g.horario}
                            </div>
                          )}
                          {g.maestra && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <User className="w-3 h-3" />
                              {g.maestra}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal !== null && (
        <GrupoModal
          grupo={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function GrupoModal({ grupo, onSave, onClose }: {
  grupo: Grupo | null
  onSave: (d: Partial<Grupo>) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [dia, setDia] = useState(grupo?.dia ?? 'MAR')
  const [horario, setHorario] = useState(grupo?.horario ?? '')
  const [maestra, setMaestra] = useState(grupo?.maestra ?? '')

  const handleSubmit = () => {
    if (!nombre.trim()) return
    onSave({
      nombre: nombre.trim(),
      dia,
      horario: horario || null,
      maestra: maestra || null,
      color: DIA_COLORS[dia]?.bg ?? '#94A3B8',
    })
  }

  const c = DIA_COLORS[dia] || { bg: '#94A3B8' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{grupo ? 'Editar grupo' : 'Nuevo grupo'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del grupo *</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Martes Matutino"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Día de clase</label>
            <div className="flex flex-wrap gap-2">
              {DIAS.map(d => {
                const dc = DIA_COLORS[d] || { bg: '#94A3B8', text: '#fff' }
                return (
                  <button
                    key={d}
                    onClick={() => setDia(d)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border-2 transition"
                    style={
                      dia === d
                        ? { background: dc.bg, color: '#fff', borderColor: dc.bg }
                        : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }
                    }
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Horario</label>
            <input
              value={horario}
              onChange={e => setHorario(e.target.value)}
              placeholder="Ej: 7:00 - 13:00"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Maestra / Profesor encargado</label>
            <input
              value={maestra}
              onChange={e => setMaestra(e.target.value)}
              placeholder="Nombre del docente"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-medium transition"
              style={{ background: c.bg }}
            >
              {grupo ? 'Guardar' : 'Crear grupo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
