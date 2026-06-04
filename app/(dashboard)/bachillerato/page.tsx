'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, Grupo, PagoBachillerato, PagoEstado, DIA_COLORS } from '@/lib/types'
import { Check, Plus, X, GraduationCap, ChevronDown, ChevronUp } from 'lucide-react'

const TIPOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as const
type TipoMes = typeof TIPOS[number]

type Columna = { anio: number; tipo: TipoMes; label: string; key: string }

function generarColumnas(): Columna[] {
  const cols: Columna[] = []
  for (let anio = 2025; anio <= 2027; anio++) {
    const inicio = anio === 2025 ? 10 : 0  // index 10 = 'nov', 0 = 'ene'
    for (let i = inicio; i < 12; i++) {
      const tipo = TIPOS[i]
      cols.push({ anio, tipo, label: tipo.toUpperCase(), key: `${anio}-${tipo}` })
    }
  }
  return cols
}

const COLUMNAS = generarColumnas()

const YEAR_GROUPS = [
  { anio: 2025, count: 2  },
  { anio: 2026, count: 12 },
  { anio: 2027, count: 12 },
]

type PagoMap = Record<string, Record<string, PagoBachillerato>>

const HOY = new Date()

export default function BachilleratoPage() {
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [pagos, setPagos] = useState<PagoMap>({})
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<PagoEstado[]>(['pagado', 'parcial', 'pendiente'])
  const [modal, setModal] = useState<{ alumna: Alumna; anio: number; tipo: TipoMes } | null>(null)
  const [loading, setLoading] = useState(true)
  const [headerOpen, setHeaderOpen] = useState(true)

  const toggleFiltro = (e: PagoEstado) =>
    setFiltroEstado(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: pg }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).in('programa', ['bachillerato', 'ambos']).eq('status', 'activa').order('nombre'),
      supabase.from('pagos_bachillerato').select('*').eq('user_id', user.id).gte('anio', 2025).lte('anio', 2027),
    ])
    setAlumnas(al ?? [])
    const map: PagoMap = {}
    ;(pg ?? []).forEach(p => {
      if (!map[p.alumna_id]) map[p.alumna_id] = {}
      map[p.alumna_id][`${p.anio}-${p.tipo}`] = p
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

  const handlePago = async (monto: number, estado: PagoEstado) => {
    if (!modal) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const key = `${modal.anio}-${modal.tipo}`
    const existing = pagos[modal.alumna.id]?.[key]
    const fecha_pago = (estado === 'pagado' || estado === 'parcial')
      ? new Date().toISOString().slice(0, 10) : null
    let row
    if (existing) {
      const { data } = await supabase.from('pagos_bachillerato')
        .update({ monto, estado, fecha_pago })
        .eq('id', existing.id).select().single()
      row = data
    } else {
      const { data } = await supabase.from('pagos_bachillerato')
        .insert({ user_id: user.id, alumna_id: modal.alumna.id, anio: modal.anio, tipo: modal.tipo, monto, estado, fecha_pago })
        .select().single()
      row = data
    }
    if (row) {
      setPagos(prev => ({
        ...prev,
        [modal.alumna.id]: { ...prev[modal.alumna.id], [key]: row }
      }))
    }
    setModal(null)
  }

  const tipoActual = TIPOS[HOY.getMonth()]

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHeaderOpen(o => !o)}
              className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400"
              title={headerOpen ? 'Colapsar' : 'Expandir'}
            >
              {headerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Bachillerato</h1>
              {headerOpen && <p className="text-xs text-slate-400 mt-0.5">Plan de pagos Nov 2025 – Dic 2027</p>}
            </div>
          </div>
        </div>

        {headerOpen && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3">
              <div className="bg-blue-50 rounded-xl p-2.5 md:p-3 border border-blue-100">
                <p className="text-[10px] md:text-xs text-blue-600 font-medium">Total cobrado</p>
                <p className="text-base md:text-xl font-bold text-blue-700 truncate">${totalPagado.toLocaleString('es-MX')}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 md:p-3 border border-slate-200">
                <p className="text-[10px] md:text-xs text-slate-500 font-medium">Alumnas en Bachi</p>
                <p className="text-base md:text-xl font-bold text-slate-700">{alumnas.length}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-2.5 md:p-3 border border-emerald-100">
                <p className="text-[10px] md:text-xs text-emerald-600 font-medium">Avance de pagos</p>
                <p className="text-base md:text-xl font-bold text-emerald-700">{avancePct}%</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 md:p-3 border border-slate-200">
                <p className="text-[10px] md:text-xs text-slate-500 font-medium">Pagos registrados</p>
                <p className="text-base md:text-xl font-bold text-slate-700">{celdasPagadas}</p>
              </div>
            </div>

            {/* Search + filtro estado */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar alumna..."
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-56"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              {(['pagado', 'parcial', 'pendiente'] as PagoEstado[]).map(e => (
                <label key={e} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={filtroEstado.includes(e)} onChange={() => toggleFiltro(e)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-slate-600">{e === 'pagado' ? 'Pagado' : e === 'parcial' ? 'Parcial' : 'Pendiente'}</span>
                  {e === 'parcial' && <span className="w-3 h-3 rounded bg-amber-500 inline-block" />}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Row 1: Year groups */}
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th rowSpan={2} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-52 sticky left-0 bg-slate-50/90 border-b border-slate-100">
                  ALUMNA
                </th>
                {YEAR_GROUPS.map(({ anio, count }) => (
                  <th key={anio} colSpan={count} className="text-center py-2 text-xs font-bold text-slate-600 border-l border-slate-200">
                    {anio}
                  </th>
                ))}
              </tr>
              {/* Row 2: Month labels */}
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {COLUMNAS.map(col => {
                  const isCurrentMonth = col.anio === HOY.getFullYear() && col.tipo === tipoActual
                  const isFirstOfYear = col.tipo === (col.anio === 2025 ? 'nov' : 'ene')
                  return (
                    <th
                      key={col.key}
                      className={`text-center px-2 py-2 min-w-[80px] ${isFirstOfYear ? 'border-l border-slate-200' : ''}`}
                    >
                      <div className={`text-xs font-semibold uppercase rounded-md px-1 py-0.5 mx-auto w-fit
                        ${isCurrentMonth ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>
                        {col.label}
                      </div>
                    </th>
                  )
                })}
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
                (() => {
                  const DIA_ORDER = ['MAR','MIE','JUE','VIE','SAB','DOM']
                  type GrupoGroup = { id: string; nombre: string; dia: string; alumnas: Alumna[] }
                  const map = new Map<string, GrupoGroup>()
                  const sinGrupo: Alumna[] = []
                  alumnasFiltradas.forEach(alumna => {
                    if (alumna.grupo_id && alumna.grupo) {
                      if (!map.has(alumna.grupo_id))
                        map.set(alumna.grupo_id, { id: alumna.grupo_id, nombre: (alumna.grupo as Grupo).nombre, dia: (alumna.grupo as Grupo).dia, alumnas: [] })
                      map.get(alumna.grupo_id)!.alumnas.push(alumna)
                    } else sinGrupo.push(alumna)
                  })
                  const grupos = Array.from(map.values()).sort((a, b) =>
                    (DIA_ORDER.indexOf(a.dia) + 99) % 99 - (DIA_ORDER.indexOf(b.dia) + 99) % 99
                  )
                  if (sinGrupo.length > 0) grupos.push({ id: 'sin-grupo', nombre: 'Sin grupo', dia: '', alumnas: sinGrupo })

                  return grupos.flatMap(grupo => [
                    <tr key={`gh-${grupo.id}`}>
                      <td colSpan={COLUMNAS.length + 1}
                        className="px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-white sticky left-0"
                        style={{ backgroundColor: DIA_COLORS[grupo.dia]?.bg ?? '#64748B' }}>
                        {grupo.nombre}
                      </td>
                    </tr>,
                    ...grupo.alumnas.map(alumna => {
                  const pagoAlumna = pagos[alumna.id] ?? {}
                  return (
                    <tr key={alumna.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-5 py-3 sticky left-0 bg-white">
                        <div className="font-medium text-slate-800">{alumna.nombre}</div>
                      </td>
                      {COLUMNAS.map(col => {
                        const pago = pagoAlumna[col.key]
                        const estado = (pago?.estado ?? 'pendiente') as PagoEstado
                        const isFirstOfYear = col.tipo === (col.anio === 2025 ? 'nov' : 'ene')
                        const isCurrent = col.anio === HOY.getFullYear() && col.tipo === tipoActual
                        if (!filtroEstado.includes(estado)) {
                          return <td key={col.key} className={`px-1 py-2 ${isFirstOfYear ? 'border-l border-slate-100' : ''} ${isCurrent ? 'bg-blue-50/20' : ''}`} />
                        }
                        return (
                          <td key={col.key} className={`px-1 py-2 text-center ${isFirstOfYear ? 'border-l border-slate-100' : ''} ${isCurrent ? 'bg-blue-50/20' : ''}`}>
                            <button
                              onClick={() => setModal({ alumna, anio: col.anio, tipo: col.tipo })}
                              className="flex items-center justify-center gap-1 mx-auto rounded-lg px-1.5 py-1 transition hover:scale-105 active:scale-95 w-full"
                            >
                              {estado === 'pagado' ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-[11px] font-medium text-slate-700">${Number(pago!.monto).toLocaleString('es-MX')}</span>
                                  <span className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </span>
                                </span>
                              ) : estado === 'parcial' ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-[11px] font-medium text-slate-700">${Number(pago!.monto).toLocaleString('es-MX')}</span>
                                  <span className="w-4 h-4 bg-amber-500 rounded flex-shrink-0" />
                                </span>
                              ) : (
                                <span className="w-6 h-6 rounded border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-400 transition mx-auto">
                                  <Plus className="w-3 h-3" />
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })])
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {modal && (
        <BachiModal
          alumna={modal.alumna}
          anio={modal.anio}
          tipo={modal.tipo}
          existing={pagos[modal.alumna.id]?.[`${modal.anio}-${modal.tipo}`]}
          onSave={handlePago}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function BachiModal({ alumna, anio, tipo, existing, onSave, onClose }: {
  alumna: Alumna; anio: number; tipo: string; existing?: PagoBachillerato
  onSave: (monto: number, estado: PagoEstado) => void; onClose: () => void
}) {
  const [monto, setMonto]   = useState(existing?.monto?.toString() ?? '')
  const [estado, setEstado] = useState<PagoEstado>(existing?.estado ?? 'pagado')
  const label = tipo.toUpperCase()

  const handleSave = () => {
    if (estado === 'pendiente') { onSave(0, 'pendiente'); return }
    // Permite $0 + 'pagado' (para marcar meses anteriores al inicio del grupo)
    onSave(parseFloat(monto) || 0, estado)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Registrar pago</h3>
            <p className="text-xs text-slate-400">{alumna.nombre} · {label} {anio}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Estado */}
          <div className="grid grid-cols-3 gap-2">
            {(['pagado', 'parcial', 'pendiente'] as PagoEstado[]).map(e => (
              <button key={e} onClick={() => setEstado(e)}
                className={`py-2 rounded-xl text-sm font-medium border transition ${
                  estado === e
                    ? e === 'pagado'   ? 'bg-blue-600 text-white border-blue-600'
                    : e === 'parcial'  ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                {e === 'pagado' ? 'Pagado' : e === 'parcial' ? 'Parcial' : 'Pendiente'}
              </button>
            ))}
          </div>

          {/* Monto (solo si no es pendiente) */}
          {estado !== 'pendiente' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0"
                  className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button onClick={handleSave}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-medium transition ${
                estado === 'pagado'  ? 'bg-blue-600 hover:bg-blue-700' :
                estado === 'parcial' ? 'bg-amber-500 hover:bg-amber-600' :
                'bg-slate-700 hover:bg-slate-800'
              }`}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
