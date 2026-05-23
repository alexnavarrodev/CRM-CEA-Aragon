'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, DIA_COLORS } from '@/lib/types'
import { UserCheck, Phone, Mail, Search } from 'lucide-react'

export default function EgresadasPage() {
  const [egresadas, setEgresadas] = useState<Alumna[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).eq('status', 'egresada').order('nombre')
    setEgresadas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtradas = egresadas.filter(a =>
    !busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const handleReactivar = async (alumna: Alumna) => {
    if (!confirm(`¿Reactivar a ${alumna.nombre} como alumna activa?`)) return
    const { data } = await supabase.from('alumnas').update({ status: 'activa' }).eq('id', alumna.id).select('*, grupo:grupos(*)').single()
    if (data) setEgresadas(prev => prev.filter(a => a.id !== alumna.id))
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Egresadas</h1>
            <p className="text-sm text-slate-400 mt-0.5">{filtradas.length} egresadas registradas</p>
          </div>
        </div>
        <div className="relative w-56">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar egresada..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full" />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay egresadas registradas</p>
            <p className="text-slate-300 text-xs mt-1">Las alumnas con estado "Egresada" aparecerán aquí</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ALUMNA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">GRUPO</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PROMEDIO</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PROGRAMA</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">INSCRIPCIÓN</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map(alumna => {
                  const g = alumna.grupo
                  const c = g ? (DIA_COLORS[g.dia] || { bg: '#94A3B8' }) : null
                  return (
                    <tr key={alumna.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{alumna.nombre}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {alumna.telefono && <span className="flex items-center gap-1 text-xs text-slate-400"><Phone className="w-3 h-3" />{alumna.telefono}</span>}
                          {alumna.email && <span className="flex items-center gap-1 text-xs text-slate-400"><Mail className="w-3 h-3" />{alumna.email}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {g && c ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ background: c.bg + '18', color: c.bg }}>
                            {g.nombre}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`font-semibold ${Number(alumna.promedio) >= 8 ? 'text-emerald-600' : Number(alumna.promedio) >= 6 ? 'text-amber-600' : 'text-red-500'}`}>
                          {Number(alumna.promedio).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs capitalize">{alumna.programa}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">
                        {alumna.fecha_inscripcion ? new Date(alumna.fecha_inscripcion + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <button onClick={() => handleReactivar(alumna)}
                          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition">
                          Reactivar
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
    </div>
  )
}
