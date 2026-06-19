'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, Grupo, PagoColegiatura, MESES, PagoEstado, DIA_COLORS } from '@/lib/types'
import { hoyMX } from '@/lib/fecha'
import { Plus, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Rango NOV 2025 → DIC 2027 ───────────────────────────────────────────────
type Columna = { anio: number; mes: number; label: string; key: string }

function generarColumnas(): Columna[] {
  const cols: Columna[] = []
  for (let anio = 2025; anio <= 2027; anio++) {
    const inicio = anio === 2025 ? 11 : 1
    for (let mes = inicio; mes <= 12; mes++) {
      cols.push({ anio, mes, label: MESES[mes - 1], key: `${anio}-${mes}` })
    }
  }
  return cols
}
const COLUMNAS = generarColumnas()

// Year groups for the header (colspan)
const YEAR_GROUPS = [
  { anio: 2025, count: 2  },   // NOV, DIC
  { anio: 2026, count: 12 },
  { anio: 2027, count: 12 },
]

// Payment map: alumna_id → 'anio-mes' → pago
type PagoMap = Record<string, Record<string, PagoColegiatura>>

const HOY = new Date()

export default function ColegiatutasPage() {
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [pagos, setPagos] = useState<PagoMap>({})
  const [grupoFiltro, setGrupoFiltro] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<PagoEstado[]>(['pagado', 'parcial', 'pendiente'])
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<{ alumna: Alumna; anio: number; mes: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [headerOpen, setHeaderOpen] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: gr }, { data: pg }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id)
        .in('programa', ['colegiaturas', 'ambos']).eq('status', 'activa').order('nombre'),
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
      supabase.from('pagos_colegiaturas').select('*').eq('user_id', user.id)
        .gte('anio', 2025).lte('anio', 2027),
    ])
    setAlumnas(al ?? [])
    setGrupos(gr ?? [])
    const map: PagoMap = {}
    ;(pg ?? []).forEach(p => {
      if (!map[p.alumna_id]) map[p.alumna_id] = {}
      map[p.alumna_id][`${p.anio}-${p.mes}`] = p
    })
    setPagos(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleFiltro = (e: PagoEstado) => {
    setFiltroEstado(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  }

  const alumnasFiltradas = alumnas.filter(a => {
    if (grupoFiltro !== 'todos' && a.grupo_id !== grupoFiltro) return false
    if (busqueda && !a.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  // Totales por columna
  const totalesCol = COLUMNAS.map(col =>
    alumnasFiltradas.reduce((sum, a) => {
      const p = pagos[a.id]?.[col.key]
      return sum + (p ? Number(p.monto) : 0)
    }, 0)
  )
  const totalCobrado = totalesCol.reduce((a, b) => a + b, 0)

  const handlePago = async (monto: number, estado: PagoEstado) => {
    if (!modal) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = pagos[modal.alumna.id]?.[`${modal.anio}-${modal.mes}`]
    let row
    if (existing) {
      const { data } = await supabase.from('pagos_colegiaturas')
        .update({ monto, estado, fecha_pago: hoyMX() })
        .eq('id', existing.id).select().single()
      row = data
    } else {
      const { data } = await supabase.from('pagos_colegiaturas')
        .insert({ user_id: user.id, alumna_id: modal.alumna.id, anio: modal.anio, mes: modal.mes, monto, estado, fecha_pago: hoyMX() })
        .select().single()
      row = data
    }
    if (row) {
      setPagos(prev => ({
        ...prev,
        [modal.alumna.id]: { ...prev[modal.alumna.id], [`${modal.anio}-${modal.mes}`]: row },
      }))
    }
    setModal(null)
  }

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
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Colegiaturas</h1>
              {headerOpen && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Total cobrado{' '}
                  <span className="font-semibold text-slate-700">${totalCobrado.toLocaleString('es-MX')}</span>
                  {' '}· Nov 2025 — Dic 2027
                </p>
              )}
            </div>
          </div>
        </div>

        {headerOpen && (
          <>
            {/* Group filters */}
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

            {/* Search + estado */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar alumna..."
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-56" />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
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
          <table className="w-full text-sm border-collapse">
            <thead>
              {/* Row 1: year groups */}
              <tr className="bg-slate-50/80">
                <th rowSpan={2}
                  className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-52 sticky left-0 bg-slate-50/90 border-b border-slate-100 z-10">
                  ALUMNA · GRUPO
                </th>
                {YEAR_GROUPS.map(yg => (
                  <th key={yg.anio} colSpan={yg.count}
                    className="text-center py-2 text-xs font-bold text-slate-600 border-b border-slate-100 border-l border-slate-200 bg-slate-50/80">
                    {yg.anio}
                  </th>
                ))}
              </tr>
              {/* Row 2: month labels */}
              <tr className="bg-slate-50/60 border-b border-slate-100">
                {COLUMNAS.map((col, i) => {
                  const isCurrent = col.anio === HOY.getFullYear() && col.mes === HOY.getMonth() + 1
                  const isFirstOfYear = col.mes === (col.anio === 2025 ? 11 : 1)
                  return (
                    <th key={col.key}
                      className={`text-center px-1 py-2 min-w-[72px] ${isCurrent ? 'bg-blue-50/80' : ''} ${isFirstOfYear ? 'border-l border-slate-200' : ''}`}>
                      <div className={`text-[11px] font-semibold uppercase ${isCurrent ? 'text-blue-600' : 'text-slate-500'}`}>{col.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        ${(totalesCol[i] / 1000).toFixed(1)}k
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
                <tr><td colSpan={COLUMNAS.length + 1} className="text-center py-16 text-slate-400">No hay alumnas en este grupo</td></tr>
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
                    ...grupo.alumnas.map(alumna => (
                    <tr key={alumna.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-5 py-2.5 sticky left-0 bg-white border-r border-slate-100">
                        <div className="font-medium text-slate-800 text-sm">{alumna.nombre}</div>
                        <div className="text-xs text-slate-400">${Number(alumna.cuota_mensual).toLocaleString('es-MX')}/mes</div>
                      </td>
                      {COLUMNAS.map(col => {
                        const isCurrent = col.anio === HOY.getFullYear() && col.mes === HOY.getMonth() + 1
                        const isFirstOfYear = col.mes === (col.anio === 2025 ? 11 : 1)
                        const pago = pagos[alumna.id]?.[col.key]
                        const estado = pago?.estado ?? 'pendiente'
                        if (!filtroEstado.includes(estado)) {
                          return <td key={col.key} className={`px-1 py-2 ${isFirstOfYear ? 'border-l border-slate-100' : ''} ${isCurrent ? 'bg-blue-50/20' : ''}`} />
                        }
                        return (
                          <td key={col.key}
                            className={`px-1 py-2 text-center ${isFirstOfYear ? 'border-l border-slate-100' : ''} ${isCurrent ? 'bg-blue-50/20' : ''}`}>
                            <button onClick={() => setModal({ alumna, anio: col.anio, mes: col.mes })}
                              className="flex items-center justify-center gap-1 mx-auto rounded-lg px-1.5 py-1 transition hover:scale-105 active:scale-95 w-full">
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
                  ))])
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <PaymentModal
          alumna={modal.alumna}
          anio={modal.anio}
          mes={modal.mes}
          existing={pagos[modal.alumna.id]?.[`${modal.anio}-${modal.mes}`]}
          onSave={handlePago}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function PaymentModal({ alumna, anio, mes, existing, onSave, onClose }: {
  alumna: Alumna; anio: number; mes: number; existing?: PagoColegiatura
  onSave: (monto: number, estado: PagoEstado) => void; onClose: () => void
}) {
  const [monto, setMonto] = useState(existing?.monto?.toString() ?? alumna.cuota_mensual.toString())
  const [estado, setEstado] = useState<PagoEstado>(existing?.estado ?? 'pagado')
  const mesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Registrar pago</h3>
            <p className="text-xs text-slate-400">{alumna.nombre} · {mesNombre} {anio}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {(['pagado','parcial','pendiente'] as PagoEstado[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`py-2 rounded-xl text-sm font-medium border transition capitalize ${estado === e
                    ? e === 'pagado'  ? 'bg-blue-600 text-white border-blue-600'
                    : e === 'parcial' ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={() => onSave(parseFloat(monto) || 0, estado)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
