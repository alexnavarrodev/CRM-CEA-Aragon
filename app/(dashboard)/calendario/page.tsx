'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, Alumna, PagoColegiatura, DIA_COLORS } from '@/lib/types'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

// Weekday name → DIA_COLORS key (JS getDay: 0=Sun,1=Mon,...,6=Sat)
const JS_DAY_TO_DIA: Record<number, string> = {
  1: 'LUN', 2: 'MAR', 3: 'MIE', 4: 'JUE', 5: 'VIE', 6: 'SAB', 0: 'DOM',
}
const DIA_ORDER = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']

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
  const [hoy]                 = useState(() => new Date())
  const [mes, setMes]         = useState(() => new Date().getMonth() + 1)   // 1–12
  const [anio, setAnio]       = useState(() => new Date().getFullYear())
  const supabase = createClient()

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

  // Stats for current mes/anio per grupo
  const statsForMes = useCallback((): GrupoStats[] => {
    return grupos
      .sort((a, b) => (DIA_ORDER.indexOf(a.dia) + 99) % 99 - (DIA_ORDER.indexOf(b.dia) + 99) % 99)
      .map(grupo => {
        const alumnaIds = alumnas.filter(a => a.grupo_id === grupo.id).map(a => a.id)
        const pagosMes = pagos.filter(p => alumnaIds.includes(p.alumna_id) && p.anio === anio && p.mes === mes)
        return {
          grupo,
          total:     alumnaIds.length,
          pagadas:   pagosMes.filter(p => p.estado === 'pagado').length,
          parciales: pagosMes.filter(p => p.estado === 'parcial').length,
        }
      })
  }, [grupos, alumnas, pagos, mes, anio])

  // Build calendar days for current month
  const buildCalendar = () => {
    const firstDay = new Date(anio, mes - 1, 1)
    const lastDay  = new Date(anio, mes, 0)
    const startDow = firstDay.getDay() // 0=Sun
    // Adjust to Monday-first grid
    const startOffset = startDow === 0 ? 6 : startDow - 1
    const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7
    const cells: (number | null)[] = Array(totalCells).fill(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells[startOffset + d - 1] = d
    }
    return cells
  }

  const calCells = buildCalendar()
  const stats    = statsForMes()

  // Grupos that meet on a given day-of-month
  const gruposForDay = (dayNum: number): GrupoStats[] => {
    const date = new Date(anio, mes - 1, dayNum)
    const dia  = JS_DAY_TO_DIA[date.getDay()]
    return stats.filter(s => s.grupo.dia === dia)
  }

  const prevMes = () => {
    if (mes === 1) { setMes(12); setAnio(y => y - 1) } else setMes(m => m - 1)
  }
  const nextMes = () => {
    if (mes === 12) { setMes(1); setAnio(y => y + 1) } else setMes(m => m + 1)
  }

  const mesLabel = new Date(anio, mes - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const DAYS_HDR = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Calendario de pagos</h1>
            <p className="text-sm text-slate-400 mt-0.5">Días de clase y estatus de cobros por grupo</p>
          </div>
          {/* Month nav */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-2 py-1.5">
            <button onClick={prevMes} className="p-1 rounded-lg hover:bg-white transition text-slate-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700 capitalize min-w-[130px] text-center">{mesLabel}</span>
            <button onClick={nextMes} className="p-1 rounded-lg hover:bg-white transition text-slate-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Group legend */}
        <div className="flex flex-wrap gap-2">
          {stats.map(({ grupo, total, pagadas, parciales }) => {
            const c = DIA_COLORS[grupo.dia] ?? { bg: '#64748B', text: '#fff' }
            const pendientes = total - pagadas - parciales
            return (
              <div key={grupo.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.bg }} />
                <span className="font-medium text-slate-700">{grupo.nombre}</span>
                <span className="text-slate-400 text-xs">{grupo.dia}</span>
                <span className="text-[11px] font-semibold text-blue-600">{pagadas}/{total}</span>
                {parciales > 0 && <span className="text-[11px] font-semibold text-amber-600">{parciales}p</span>}
                {pendientes > 0 && <span className="text-[11px] text-slate-400">{pendientes}✗</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-slate-400">Cargando...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAYS_HDR.map(d => (
                <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {d}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="grid grid-cols-7">
              {calCells.map((dayNum, i) => {
                const isToday = dayNum !== null
                  && dayNum === hoy.getDate()
                  && mes === hoy.getMonth() + 1
                  && anio === hoy.getFullYear()
                const isWeekend = i % 7 >= 5
                const grupos = dayNum !== null ? gruposForDay(dayNum) : []

                return (
                  <div
                    key={i}
                    className={`min-h-[90px] md:min-h-[110px] p-1.5 border-b border-r border-slate-50
                      ${isWeekend ? 'bg-slate-50/40' : 'bg-white'}
                      ${i % 7 === 6 ? 'border-r-0' : ''}
                      ${i >= calCells.length - 7 ? 'border-b-0' : ''}
                    `}
                  >
                    {dayNum !== null && (
                      <>
                        {/* Day number */}
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${
                          isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                        }`}>
                          {dayNum}
                        </div>

                        {/* Group events */}
                        <div className="space-y-0.5">
                          {grupos.map(({ grupo, total, pagadas, parciales }) => {
                            const c = DIA_COLORS[grupo.dia] ?? { bg: '#64748B', text: '#fff' }
                            const pendientes = total - pagadas - parciales
                            return (
                              <div
                                key={grupo.id}
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight flex items-center justify-between gap-1"
                                style={{ background: c.bg + '20', color: c.bg, borderLeft: `2.5px solid ${c.bg}` }}
                              >
                                <span className="truncate">{grupo.nombre}</span>
                                <span className="flex-shrink-0 font-semibold">
                                  {pagadas}/{total}
                                  {pendientes > 0 && <span className="text-red-400 ml-0.5">·{pendientes}✗</span>}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Monthly summary table by group */}
        {!loading && stats.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <h2 className="text-sm font-semibold text-slate-700">
                Resumen — {mesLabel}
              </h2>
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
                  {stats.map(({ grupo, total, pagadas, parciales }) => {
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
