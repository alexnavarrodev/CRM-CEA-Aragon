'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, Alumna, PagoColegiatura, DIA_COLORS } from '@/lib/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DIA_ORDER = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']

// DIA string → JS getDay() number
const DIA_TO_JS: Record<string, number> = {
  LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6, DOM: 0,
}

// nth occurrence of a weekday in a month (1-indexed)
function nthWeekday(year: number, month: number, weekdayJS: number, n: number): Date | null {
  let count = 0
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month - 1, d)
    if (date.getMonth() !== month - 1) break
    if (date.getDay() === weekdayJS) {
      count++
      if (count === n) return date
    }
  }
  return null
}

// Which occurrence (1st,2nd,3rd…) is a date within its month?
function occurrenceInMonth(date: Date): number {
  const weekday = date.getDay()
  let count = 0
  for (let d = 1; d <= date.getDate(); d++) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === weekday) count++
  }
  return count
}

// Format date as DD/MM/YYYY
function fmt(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
}

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Payment schedule for a group ─────────────────────────────────────────────
// Generates one date per month, starting from the group's start month.
// Uses the same nth-weekday occurrence as the start date.
interface PaymentRow {
  year: number
  month: number           // 1–12
  fecha: Date
  label: string           // "Ene 2026"
  isLiqCert: boolean
  isPast: boolean
  isNext: boolean         // very next upcoming payment
  rowIndex: number        // 0 = Inicio
}

function buildSchedule(
  grupo: Grupo,
  startYear: number,
  startMonth: number,
  today: Date,
): PaymentRow[] {
  const weekdayJS = DIA_TO_JS[grupo.dia] ?? 2
  // Determine which occurrence to use: 2nd by default, or derived from start
  const startDate = nthWeekday(startYear, startMonth, weekdayJS, 2) ?? new Date(startYear, startMonth - 1, 14)
  const occurrence = occurrenceInMonth(startDate)

  const rows: PaymentRow[] = []
  let nextFlagSet = false

  // Inicio row (index 0)
  rows.push({
    year: startYear, month: startMonth,
    fecha: startDate,
    label: `${MESES_CORTOS[startMonth - 1]} ${startYear}`,
    isLiqCert: false,
    isPast: startDate < today,
    isNext: false,
    rowIndex: 0,
  })

  // Generate rows for subsequent months through Dec 2027
  let rowIndex = 1
  for (let y = startYear; y <= 2027; y++) {
    const mStart = y === startYear ? startMonth + 1 : 1
    for (let m = mStart; m <= 12; m++) {
      const fecha = nthWeekday(y, m, weekdayJS, occurrence) ??
                    nthWeekday(y, m, weekdayJS, occurrence - 1) ??
                    new Date(y, m - 1, 14)
      const isPast = fecha < today
      const isNext = !isPast && !nextFlagSet
      if (isNext) nextFlagSet = true

      rows.push({
        year: y, month: m,
        fecha,
        label: `${MESES_CORTOS[m - 1]} ${y}`,
        // Row 8 (0-indexed rowIndex 8) = Liq. Certificado
        isLiqCert: rowIndex === 8,
        isPast,
        isNext,
        rowIndex,
      })
      rowIndex++
    }
  }
  return rows
}

// ─── Component ────────────────────────────────────────────────────────────────
interface GrupoStats {
  grupo: Grupo
  total: number
  pagadas: number
  parciales: number
}

export default function CalendarioPage() {
  const [grupos, setGrupos]   = useState<Grupo[]>([])
  const [alumnas, setAlumnas] = useState<Pick<Alumna, 'id' | 'nombre' | 'grupo_id'>[]>([])
  const [pagos, setPagos]     = useState<PagoColegiatura[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes]         = useState(() => new Date().getMonth() + 1)
  const [anio, setAnio]       = useState(() => new Date().getFullYear())
  const supabase = createClient()
  const today = new Date(); today.setHours(0,0,0,0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: gr }, { data: al }, { data: pg }] = await Promise.all([
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
      supabase.from('alumnas').select('id,nombre,grupo_id').eq('user_id', user.id).eq('status','activa'),
      supabase.from('pagos_colegiaturas').select('*').eq('user_id', user.id),
    ])
    setGrupos(gr ?? [])
    setAlumnas(al ?? [])
    setPagos(pg ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sortedGrupos = [...grupos].sort(
    (a, b) => (DIA_ORDER.indexOf(a.dia) + 99) % 99 - (DIA_ORDER.indexOf(b.dia) + 99) % 99
  )

  // Find first payment month for each group
  function getGroupStart(grupo: Grupo): { year: number; month: number } {
    const alumnaIds = alumnas.filter(a => a.grupo_id === grupo.id).map(a => a.id)
    const groupPagos = pagos.filter(p => alumnaIds.includes(p.alumna_id))
    if (groupPagos.length === 0) return { year: 2025, month: 11 }
    const earliest = groupPagos.reduce((min, p) => {
      const val = p.anio * 100 + p.mes
      return val < min.val ? { val, year: p.anio, month: p.mes } : min
    }, { val: Infinity, year: 2025, month: 11 })
    return { year: earliest.year, month: earliest.month }
  }

  // Build all schedules
  const schedules = sortedGrupos.map(grupo => {
    const { year, month } = getGroupStart(grupo)
    return { grupo, rows: buildSchedule(grupo, year, month, today) }
  })

  // Max rows across all groups
  const maxRows = Math.max(...schedules.map(s => s.rows.length), 0)

  // Summary stats for selected month
  const statsForMes: GrupoStats[] = sortedGrupos.map(grupo => {
    const alumnaIds = alumnas.filter(a => a.grupo_id === grupo.id).map(a => a.id)
    const pagosMes = pagos.filter(p => alumnaIds.includes(p.alumna_id) && p.anio === anio && p.mes === mes)
    return {
      grupo,
      total:     alumnaIds.length,
      pagadas:   pagosMes.filter(p => p.estado === 'pagado').length,
      parciales: pagosMes.filter(p => p.estado === 'parcial').length,
    }
  })

  const mesLabel = new Date(anio, mes - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  const prevMes = () => { if (mes === 1) { setMes(12); setAnio(y => y - 1) } else setMes(m => m - 1) }
  const nextMes = () => { if (mes === 12) { setMes(1); setAnio(y => y + 1) } else setMes(m => m + 1) }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Calendario de pagos</h1>
        <p className="text-sm text-slate-400 mt-0.5">Fechas de pago por grupo — Nov 2025 a Dic 2027</p>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">

        {/* ── Payment schedule table ──────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16 text-slate-400">No hay grupos configurados</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-sm border-collapse" style={{ minWidth: `${100 + schedules.length * 130}px` }}>
              <thead>
                <tr>
                  {/* Empty top-left cell */}
                  <th className="sticky left-0 bg-white z-10 w-24 border-b border-slate-200" />
                  {schedules.map(({ grupo }) => {
                    const c = DIA_COLORS[grupo.dia] ?? { bg: '#64748B', text: '#fff' }
                    return (
                      <th key={grupo.id} className="border-b border-slate-200 border-l border-slate-100 px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-white px-2.5 py-1 rounded-lg"
                            style={{ background: c.bg }}>
                            {grupo.nombre}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">{grupo.dia}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }, (_, rowIdx) => {
                  // Check if this row is "Liq. Certificado" for any group
                  const isLiqCertRow = schedules.some(s => s.rows[rowIdx]?.isLiqCert)
                  const rowLabel = rowIdx === 0 ? 'Inicio' : isLiqCertRow ? 'Liq. Cert.' : `Pago ${rowIdx}`

                  return (
                    <tr key={rowIdx}
                      className={isLiqCertRow ? 'bg-blue-50' : ''}
                    >
                      {/* Row label */}
                      <td className={`sticky left-0 z-10 px-3 py-2 text-xs font-semibold border-r border-slate-100 whitespace-nowrap
                        ${isLiqCertRow ? 'bg-blue-50 text-blue-700' : rowIdx === 0 ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-400'}`}>
                        {rowLabel}
                      </td>

                      {/* Date cells for each group */}
                      {schedules.map(({ grupo, rows }) => {
                        const row = rows[rowIdx]
                        if (!row) return (
                          <td key={grupo.id} className="border-l border-slate-50 px-3 py-2" />
                        )

                        const c = DIA_COLORS[grupo.dia] ?? { bg: '#64748B', text: '#fff' }

                        return (
                          <td key={grupo.id}
                            className={`border-l border-slate-100 px-3 py-2 text-center whitespace-nowrap
                              ${row.isPast    ? 'bg-slate-100' : ''}
                              ${row.isNext    ? 'bg-yellow-50' : ''}
                              ${row.isLiqCert ? 'bg-blue-50'   : ''}
                            `}
                          >
                            {row.isPast ? (
                              <span className="text-xs text-slate-400 line-through">{fmt(row.fecha)}</span>
                            ) : row.isNext ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md text-white"
                                style={{ background: c.bg }}>
                                {fmt(row.fecha)}
                              </span>
                            ) : row.isLiqCert ? (
                              <span className="text-xs font-semibold text-blue-700">{fmt(row.fecha)}</span>
                            ) : (
                              <span className="text-xs text-slate-700">{fmt(row.fecha)}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200" /> Pagado / pasado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" /> Próximo pago</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Liq. Certificado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-slate-200" /> Futuro</span>
            </div>
          </div>
        )}

        {/* ── Monthly summary table (SIN TOCAR) ───────────────────── */}
        {!loading && statsForMes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Month navigation for summary */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 capitalize">
                Resumen — {mesLabel}
              </h2>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1.5 py-1">
                <button onClick={prevMes} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-500">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-slate-600 px-1 min-w-[90px] text-center capitalize">{mesLabel}</span>
                <button onClick={nextMes} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-500">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-50 bg-slate-50/30">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Grupo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Día</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">Pagadas</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-amber-500 uppercase tracking-wider">Parcial</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-red-400 uppercase tracking-wider">Pendiente</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {statsForMes.map(({ grupo, total, pagadas, parciales }) => {
                    const c = DIA_COLORS[grupo.dia] ?? { bg: '#64748B', text: '#fff' }
                    const pendientes = total - pagadas - parciales
                    const pct = total > 0 ? Math.round(((pagadas + parciales * 0.5) / total) * 100) : 0
                    return (
                      <tr key={grupo.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.bg }} />
                            <span className="font-medium text-slate-800">{grupo.nombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md text-white" style={{ background: c.bg }}>
                            {grupo.dia}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600 font-medium">{total}</td>
                        <td className="px-4 py-3 text-center text-blue-600 font-semibold">{pagadas}</td>
                        <td className="px-4 py-3 text-center text-amber-600 font-semibold">{parciales}</td>
                        <td className="px-4 py-3 text-center text-red-400 font-medium">{pendientes}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
