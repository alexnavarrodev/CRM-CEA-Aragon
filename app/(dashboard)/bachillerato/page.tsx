'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, PagoBachillerato, PagoEstado } from '@/lib/types'
import { Check, Plus, X, GraduationCap } from 'lucide-react'

const ANIO = new Date().getFullYear()

const COLUMNAS = [
  { key: 'inscripcion', label: 'INSCRIPCIÓN' },
  { key: 'materiales',  label: 'MATERIALES' },
  { key: 'ene', label: 'ENE' },
  { key: 'feb', label: 'FEB' },
  { key: 'mar', label: 'MAR' },
  { key: 'abr', label: 'ABR' },
  { key: 'may', label: 'MAY' },
  { key: 'jun', label: 'JUN' },
  { key: 'jul', label: 'JUL' },
  { key: 'ago', label: 'AGO' },
  { key: 'sep', label: 'SEP' },
  { key: 'oct', label: 'OCT' },
  { key: 'nov', label: 'NOV' },
  { key: 'dic', label: 'DIC' },
]

type PagoMap = Record<string, Record<string, PagoBachillerato>>

export default function BachilleratoPage() {
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [pagos, setPagos] = useState<PagoMap>({})
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<{ alumna: Alumna; tipo: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: pg }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).in('programa', ['bachillerato', 'ambos']).eq('status', 'activa').order('nombre'),
      supabase.from('pagos_bachillerato').select('*').eq('user_id', user.id).eq('anio', ANIO),
    ])
    setAlumnas(al ?? [])
    const map: PagoMap = {}
    ;(pg ?? []).forEach(p => {
      if (!map[p.alumna_id]) map[p.alumna_id] = {}
      map[p.alumna_id][p.tipo] = p
    })
    setPagos(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const alumnasFiltradas = alumnas.filter(a =>
    !busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  // KPIs
  const totalPagado = alumnas.reduce((sum, a) => {
    return sum + Object.values(pagos[a.id] ?? {}).filter(p => p.estado === 'pagado').reduce((s, p) => s + Number(p.monto), 0)
  }, 0)

  const totalCeldas = alumnas.length * COLUMNAS.length
  const celdasPagadas = alumnas.reduce((sum, a) => sum + Object.values(pagos[a.id] ?? {}).filter(p => p.estado === 'pagado').length, 0)
  const avancePct = totalCeldas > 0 ? Math.round((celdasPagadas / totalCeldas) * 100) : 0

  const handlePago = async (monto: number, estado: 'pagado' | 'pendiente') => {
    if (!modal) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = pagos[modal.alumna.id]?.[modal.tipo]
    let row
    if (existing) {
      const { data } = await supabase.from('pagos_bachillerato').update({ monto, estado, fecha_pago: estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null }).eq('id', existing.id).select().single()
      row = data
    } else {
      const { data } = await supabase.from('pagos_bachillerato').insert({ user_id: user.id, alumna_id: modal.alumna.id, anio: ANIO, tipo: modal.tipo, monto, estado, fecha_pago: estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null }).select().single()
      row = data
    }
    if (row) {
      setPagos(prev => ({ ...prev, [modal.alumna.id]: { ...prev[modal.alumna.id], [modal.tipo]: row } }))
    }
    setModal(null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bachillerato {ANIO}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Plan de pagos del ciclo escolar</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">Cobrado del año</p>
            <p className="text-xl font-bold text-blue-700">${totalPagado.toLocaleString('es-MX')}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs text-slate-500 font-medium">Alumnas en Bachi</p>
            <p className="text-xl font-bold text-slate-700">{alumnas.length}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
            <p className="text-xs text-emerald-600 font-medium">Avance de pagos</p>
            <p className="text-xl font-bold text-emerald-700">{avancePct}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs text-slate-500 font-medium">Pagos registrados</p>
            <p className="text-xl font-bold text-slate-700">{celdasPagadas}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-56">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar alumna..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-52 sticky left-0 bg-slate-50/90">ALUMNA</th>
                {COLUMNAS.map(col => (
                  <th key={col.key} className="text-center px-2 py-3 min-w-[90px]">
                    <div className="text-xs font-semibold text-slate-500 uppercase">{col.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNAS.length + 1} className="text-center py-16 text-slate-400">Cargando...</td></tr>
              ) : alumnasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS.length + 1} className="text-center py-16">
                    <GraduationCap className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">No hay alumnas en bachillerato</p>
                    <p className="text-slate-300 text-xs mt-1">Agrega alumnas con programa "bachillerato" o "ambos"</p>
                  </td>
                </tr>
              ) : (
                alumnasFiltradas.map((alumna, idx) => {
                  const pagoAlumna = pagos[alumna.id] ?? {}
                  return (
                    <tr key={alumna.id} className={`border-t border-slate-50 hover:bg-slate-50/40 transition`}>
                      <td className="px-5 py-3 sticky left-0 bg-white">
                        <div className="font-medium text-slate-800">{alumna.nombre}</div>
                        {alumna.grupo && (
                          <div className="text-xs text-slate-400">{alumna.grupo.nombre}</div>
                        )}
                      </td>
                      {COLUMNAS.map(col => {
                        const pago = pagoAlumna[col.key]
                        const pagado = pago?.estado === 'pagado'
                        return (
                          <td key={col.key} className="px-2 py-2 text-center">
                            <button
                              onClick={() => setModal({ alumna, tipo: col.key })}
                              className="flex items-center justify-center gap-1 mx-auto rounded-lg px-2 py-1.5 min-w-[76px] transition hover:scale-105 active:scale-95"
                              style={pagado ? { background: '#2563EB' } : { background: '#F8FAFC', border: '1.5px dashed #CBD5E1' }}
                            >
                              {pagado ? (
                                <div className="flex flex-col items-center">
                                  <Check className="w-3.5 h-3.5 text-white mb-0.5" />
                                  {pago.fecha_pago && (
                                    <span className="text-[10px] text-blue-100 leading-tight">
                                      {new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Plus className="w-3.5 h-3.5 text-slate-300" />
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {modal && (
        <BachiModal
          alumna={modal.alumna}
          tipo={modal.tipo}
          existing={pagos[modal.alumna.id]?.[modal.tipo]}
          onSave={handlePago}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function BachiModal({ alumna, tipo, existing, onSave, onClose }: {
  alumna: Alumna; tipo: string; existing?: PagoBachillerato
  onSave: (monto: number, estado: 'pagado' | 'pendiente') => void; onClose: () => void
}) {
  const [monto, setMonto] = useState(existing?.monto?.toString() ?? '')
  const colLabel = COLUMNAS.find(c => c.key === tipo)?.label ?? tipo.toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Registrar pago</h3>
            <p className="text-xs text-slate-400">{alumna.nombre} · {colLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            {existing?.estado === 'pagado' && (
              <button onClick={() => onSave(0, 'pendiente')} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition">
                Revertir
              </button>
            )}
            <button onClick={() => onSave(parseFloat(monto) || 0, 'pagado')}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Marcar pagado
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
