'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, Alumna, PagoColegiatura, DIA_COLORS } from '@/lib/types'
import { ChevronLeft, ChevronRight, Plus, Trash2, X, RefreshCw, Copy } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface PaymentCalendar {
  id: string
  nombre: string
  color: string        // hex
  inicio: string       // 'DD/MM/YYYY'
  pagos: string[]      // N entradas 'DD/MM/YYYY' (variable, mínimo 1)
  liqCertIndex: number // índice de pagos[] que es Liq. Certificado
}

// ─── Exact dates from image ───────────────────────────────────────────────────
const INITIAL_CALENDARS: PaymentCalendar[] = [
  {
    id: 'cal-mml', nombre: 'MML', color: '#EC4899',
    inicio: '10/02/2026',
    pagos: ['10/03/2026','14/04/2026','12/05/2026','16/06/2026','14/07/2026',
            '11/08/2026','15/09/2026','13/10/2026','10/11/2026','15/12/2026','12/01/2027'],
    liqCertIndex: 7,
  },
  {
    id: 'cal-vml', nombre: 'VML', color: '#F97316',
    inicio: '17/04/2026',
    pagos: ['15/05/2026','19/06/2026','17/07/2026','14/08/2026','18/09/2026',
            '16/10/2026','20/11/2026','18/12/2026','15/01/2027','19/02/2027','19/03/2027'],
    liqCertIndex: 7,
  },
  {
    id: 'cal-jmt', nombre: 'JMT', color: '#94A3B8',
    inicio: '20/11/2025',
    pagos: ['22/01/2026','19/02/2026','19/03/2026','23/04/2026','21/05/2026',
            '18/06/2026','23/07/2026','20/08/2026','24/09/2026','22/10/2026','19/11/2026'],
    liqCertIndex: 7,
  },
  {
    id: 'cal-vmx', nombre: 'VMX', color: '#10B981',
    inicio: '23/01/2026',
    pagos: ['20/02/2026','20/03/2026','24/04/2026','22/05/2026','19/06/2026',
            '24/07/2026','21/08/2026','18/09/2026','23/10/2026','20/11/2026','18/12/2026'],
    liqCertIndex: 7,
  },
  {
    id: 'cal-smx', nombre: 'SMX', color: '#3B82F6',
    inicio: '14/02/2026',
    pagos: ['14/03/2026','11/04/2026','16/05/2026','13/06/2026','11/07/2026',
            '15/08/2026','12/09/2026','10/10/2026','14/11/2026','12/12/2026','16/01/2027'],
    liqCertIndex: 7,
  },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseDMY(s: string): Date {
  const [d, m, y] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDMY(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
// toInputDate: 'DD/MM/YYYY' → 'YYYY-MM-DD'
function toInput(s: string): string {
  if (!s) return ''
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}
// fromInput: 'YYYY-MM-DD' → 'DD/MM/YYYY'
function fromInput(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// Generate 11 monthly dates from a start date (nth weekday of month)
function nthWeekday(year: number, month: number, wd: number, n: number): Date | null {
  let count = 0
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month - 1, d)
    if (dt.getMonth() !== month - 1) break
    if (dt.getDay() === wd) { count++; if (count === n) return dt }
  }
  return null
}
function occurrenceInMonth(dt: Date): number {
  let c = 0
  for (let d = 1; d <= dt.getDate(); d++)
    if (new Date(dt.getFullYear(), dt.getMonth(), d).getDay() === dt.getDay()) c++
  return c
}
function autoGeneratePagos(inicioStr: string, count = 11): string[] {
  if (!inicioStr) return Array(count).fill('')
  const inicio = parseDMY(inicioStr)
  const wd = inicio.getDay()
  const nth = occurrenceInMonth(inicio)
  const result: string[] = []
  let y = inicio.getFullYear(), m = inicio.getMonth() + 1
  for (let i = 0; i < count; i++) {
    m++; if (m > 12) { m = 1; y++ }
    const dt = nthWeekday(y, m, wd, nth) ?? nthWeekday(y, m, wd, nth > 1 ? nth - 1 : 1) ?? new Date(y, m - 1, 14)
    result.push(fmtDMY(dt))
  }
  return result
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const META_KEY = 'payment_calendars_v2'

// ─── Color presets ────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#EC4899','#F97316','#94A3B8','#10B981','#3B82F6',
  '#8B5CF6','#06B6D4','#D97706','#EF4444','#14B8A6',
  '#6366F1','#84CC16',
]

const DIA_ORDER = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalendarioPage() {
  const [calendars, setCalendars]     = useState<PaymentCalendar[]>([])
  const [loadingCals, setLoadingCals] = useState(true)
  const [saving, setSaving]           = useState(false)
  const [addModal, setAddModal]       = useState(false)
  const [templateCal, setTemplateCal] = useState<PaymentCalendar | null>(null) // para copiar
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Summary section
  const [grupos, setGrupos]   = useState<Grupo[]>([])
  const [alumnas, setAlumnas] = useState<Pick<Alumna, 'id' | 'nombre' | 'grupo_id'>[]>([])
  const [pagos, setPagos]     = useState<PagoColegiatura[]>([])
  const [mes, setMes]         = useState(() => new Date().getMonth() + 1)
  const [anio, setAnio]       = useState(() => new Date().getFullYear())
  const supabase = createClient()

  const today = new Date(); today.setHours(0,0,0,0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load calendars from user_metadata
    const raw = user.user_metadata?.[META_KEY]
    if (Array.isArray(raw) && raw.length > 0) {
      setCalendars(raw as PaymentCalendar[])
    } else {
      // First load: pre-populate with the 5 groups from image
      setCalendars(INITIAL_CALENDARS)
      await supabase.auth.updateUser({ data: { [META_KEY]: INITIAL_CALENDARS } })
    }
    setLoadingCals(false)

    // Load summary data
    const [{ data: gr }, { data: al }, { data: pg }] = await Promise.all([
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
      supabase.from('alumnas').select('id,nombre,grupo_id').eq('user_id', user.id).eq('status','activa'),
      supabase.from('pagos_colegiaturas').select('*').eq('user_id', user.id),
    ])
    setGrupos(gr ?? [])
    setAlumnas(al ?? [])
    setPagos(pg ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const persist = async (cals: PaymentCalendar[]) => {
    setSaving(true)
    await supabase.auth.updateUser({ data: { [META_KEY]: cals } })
    setSaving(false)
  }

  const handleAddCalendar = async (cal: PaymentCalendar) => {
    const updated = [...calendars, cal]
    setCalendars(updated)
    setAddModal(false)
    await persist(updated)
  }

  const handleDelete = async (id: string) => {
    const updated = calendars.filter(c => c.id !== id)
    setCalendars(updated)
    setDeleteConfirm(null)
    await persist(updated)
  }

  // Abrir modal en blanco o como copia
  const openNew  = () => { setTemplateCal(null); setAddModal(true) }
  const openCopy = (cal: PaymentCalendar) => { setTemplateCal(cal); setAddModal(true) }

  // ── Table rendering ──────────────────────────────────────────────────────
  // Filas = 1 (Inicio) + el máximo de pagos entre todos los calendarios
  const maxPagos = calendars.reduce((m, c) => Math.max(m, c.pagos.length), 0)
  const TOTAL_ROWS = 1 + maxPagos

  const rowLabel = (rowIdx: number, cals: PaymentCalendar[]) => {
    if (rowIdx === 0) return 'Inicio'
    const pagoIdx = rowIdx - 1  // 0-based index into pagos[]
    // Check if any calendar has LiqCert at this pagoIdx
    const isLiq = cals.some(c => c.liqCertIndex === pagoIdx)
    if (isLiq) return 'Liq. Cert.'
    return `Pago ${pagoIdx + 1}`
  }

  // Summary
  const sortedGrupos = [...grupos].sort(
    (a, b) => (DIA_ORDER.indexOf(a.dia) + 99) % 99 - (DIA_ORDER.indexOf(b.dia) + 99) % 99
  )
  const statsForMes = sortedGrupos.map(grupo => {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Calendario de pagos</h1>
            <p className="text-sm text-slate-400 mt-0.5">Fechas de pago por grupo</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-slate-400 animate-pulse">Guardando…</span>}
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo calendario</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">

        {/* ── Payment schedule table ──────────────────────────────────── */}
        {loadingCals ? (
          <div className="text-center py-16 text-slate-400">Cargando...</div>
        ) : calendars.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400 text-sm">No hay calendarios</p>
            <button onClick={() => setAddModal(true)} className="mt-2 text-blue-600 text-sm font-medium hover:underline">
              + Agregar primer calendario
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-sm border-collapse" style={{ minWidth: `${96 + calendars.length * 128}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white z-10 w-24 border-b border-slate-200" />
                  {calendars.map(cal => (
                    <th key={cal.id} className="border-b border-slate-200 border-l border-slate-100 px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs font-bold text-white px-2.5 py-1 rounded-lg"
                          style={{ background: cal.color }}>
                          {cal.nombre}
                        </span>
                        <button
                          onClick={() => openCopy(cal)}
                          className="p-1 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"
                          title="Copiar calendario"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(cal.id)}
                          className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: TOTAL_ROWS }, (_, rowIdx) => {
                  const label = rowLabel(rowIdx, calendars)
                  const isInicio   = rowIdx === 0
                  const isLiqCert  = label === 'Liq. Cert.'

                  return (
                    <tr key={rowIdx} className={isLiqCert ? 'bg-blue-50' : isInicio ? 'bg-slate-50' : ''}>
                      {/* Row label */}
                      <td className={`sticky left-0 z-10 px-3 py-2 text-xs font-semibold border-r border-slate-100 whitespace-nowrap
                        ${isLiqCert ? 'bg-blue-50 text-blue-700' : isInicio ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-400'}`}>
                        {label}
                      </td>

                      {calendars.map(cal => {
                        const dateStr = isInicio ? cal.inicio : cal.pagos[rowIdx - 1]
                        if (!dateStr) return (
                          <td key={cal.id} className="border-l border-slate-100 px-3 py-2" />
                        )

                        const date     = parseDMY(dateStr)
                        const isPast   = date < today
                        const pagoIdx  = rowIdx - 1
                        const isThisLiq = !isInicio && cal.liqCertIndex === pagoIdx

                        // Determine "next upcoming" = first future pago for this calendar
                        const isNext = !isInicio && !isPast &&
                          cal.pagos.slice(0, pagoIdx).every(p => parseDMY(p) < today)

                        return (
                          <td key={cal.id}
                            className={`border-l border-slate-100 px-3 py-1.5 text-center whitespace-nowrap
                              ${isPast && !isInicio ? 'bg-slate-100' : ''}
                              ${isNext ? 'bg-yellow-50' : ''}
                              ${isThisLiq ? 'bg-blue-50' : ''}
                            `}
                          >
                            {isInicio ? (
                              <span className="text-xs text-slate-500">Inicio — {dateStr}</span>
                            ) : isPast ? (
                              <span className="text-xs text-slate-400">{dateStr}</span>
                            ) : isNext ? (
                              <span className="text-xs font-bold text-white px-2 py-0.5 rounded-md"
                                style={{ background: cal.color }}>
                                {dateStr}
                              </span>
                            ) : isThisLiq ? (
                              <span className="text-xs font-semibold text-blue-700">{dateStr}</span>
                            ) : (
                              <span className="text-xs text-slate-700">{dateStr}</span>
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
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-wrap gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200" /> Pasado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" /> Próximo pago</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Liq. Certificado</span>
            </div>
          </div>
        )}

        {/* ── Monthly summary (unchanged) ──────────────────────────── */}
        {statsForMes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 capitalize">Resumen — {mesLabel}</h2>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1.5 py-1">
                <button onClick={prevMes} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-500"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <span className="text-xs font-medium text-slate-600 px-1 min-w-[90px] text-center capitalize">{mesLabel}</span>
                <button onClick={nextMes} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-500"><ChevronRight className="w-3.5 h-3.5" /></button>
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
                        <td className="px-5 py-3"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.bg }} /><span className="font-medium text-slate-800">{grupo.nombre}</span></div></td>
                        <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-md text-white" style={{ background: c.bg }}>{grupo.dia}</span></td>
                        <td className="px-4 py-3 text-center text-slate-600 font-medium">{total}</td>
                        <td className="px-4 py-3 text-center text-blue-600 font-semibold">{pagadas}</td>
                        <td className="px-4 py-3 text-center text-amber-600 font-semibold">{parciales}</td>
                        <td className="px-4 py-3 text-center text-red-400 font-medium">{pendientes}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
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

      {/* ── Add Calendar Modal ─────────────────────────────────────── */}
      {addModal && (
        <AddCalendarModal
          template={templateCal}
          onSave={handleAddCalendar}
          onClose={() => { setAddModal(false); setTemplateCal(null) }}
        />
      )}

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-center font-semibold text-slate-900 mb-1">Eliminar calendario</h3>
            <p className="text-center text-sm text-slate-400 mb-6">¿Eliminar «{calendars.find(c => c.id === deleteConfirm)?.nombre}»?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Calendar Modal ───────────────────────────────────────────────────────
function AddCalendarModal({ template, onSave, onClose }: {
  template?: PaymentCalendar | null
  onSave: (cal: PaymentCalendar) => void
  onClose: () => void
}) {
  const isCopy = !!template
  const [nombre,     setNombre]     = useState(template ? `${template.nombre} (copia)` : '')
  const [color,      setColor]      = useState(template ? template.color : COLOR_PRESETS[0])
  const [inicio,     setInicio]     = useState(template ? toInput(template.inicio) : '')  // 'YYYY-MM-DD'
  const [pagos,      setPagos]      = useState<string[]>(
    template ? template.pagos.map(toInput) : Array(11).fill('')
  )
  const [liqCertIdx, setLiqCertIdx] = useState(template ? template.liqCertIndex : 7)

  const handleAutoGenerate = () => {
    if (!inicio) return
    const generated = autoGeneratePagos(fromInput(inicio), pagos.length)
    setPagos(generated.map(toInput))
  }

  const addPago = () => setPagos(prev => [...prev, ''])
  const removePago = (idx: number) => {
    setPagos(prev => prev.filter((_, j) => j !== idx))
    // Ajustar liqCertIdx si se elimina antes o en su posición
    setLiqCertIdx(prev => {
      if (idx < prev) return prev - 1
      if (idx === prev) return Math.max(0, prev - 1)
      return prev
    })
  }

  const handleSave = () => {
    if (!nombre.trim() || !inicio || pagos.length === 0 || pagos.some(p => !p)) return
    onSave({
      id: `cal-${Date.now()}`,
      nombre: nombre.trim(),
      color,
      inicio: fromInput(inicio),
      pagos: pagos.map(fromInput),
      liqCertIndex: Math.min(liqCertIdx, pagos.length - 1),
    })
  }

  const allFilled = nombre.trim() && inicio && pagos.length > 0 && pagos.every(p => p)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg mx-0 sm:mx-4 max-h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-semibold text-slate-900">
            {isCopy ? 'Copiar calendario' : 'Nuevo calendario de pagos'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {isCopy && (
            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              <Copy className="w-3.5 h-3.5 flex-shrink-0" />
              Copiando «{template!.nombre}». Edita lo que necesites antes de guardar.
            </div>
          )}

          {/* Nombre + Color */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Nombre del grupo</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: SMX2"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Color</label>
              <div className="flex flex-wrap gap-1.5 max-w-[140px]">
                {COLOR_PRESETS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-lg transition ${color === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-110'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* Preview chip */}
          {nombre && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Vista previa:</span>
              <span className="text-xs font-bold text-white px-2.5 py-1 rounded-lg" style={{ background: color }}>{nombre}</span>
            </div>
          )}

          {/* Fecha inicio + auto-generate */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha de inicio</label>
            <div className="flex gap-2">
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleAutoGenerate} disabled={!inicio}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-xs font-medium hover:bg-blue-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                <RefreshCw className="w-3.5 h-3.5" />
                Auto-generar
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Rellena automáticamente todos los pagos (mismo día del mes) a partir de la fecha de inicio.</p>
          </div>

          {/* Liq. Cert position */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Fila de Liq. Certificado</label>
            <select value={liqCertIdx} onChange={e => setLiqCertIdx(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {pagos.map((_, i) => (
                <option key={i} value={i}>Pago {i + 1}</option>
              ))}
            </select>
          </div>

          {/* Payment dates (variable) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {pagos.length} fechas de pago
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {pagos.map((p, i) => (
                <div key={i} className={`flex items-center gap-1.5 p-2 rounded-xl border ${liqCertIdx === i ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                  <span className={`text-[10px] font-semibold w-12 flex-shrink-0 ${liqCertIdx === i ? 'text-blue-600' : 'text-slate-400'}`}>
                    {liqCertIdx === i ? 'Liq.Cert' : `Pago ${i + 1}`}
                  </span>
                  <input type="date" value={p}
                    onChange={e => setPagos(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    className="flex-1 min-w-0 px-1.5 py-1 text-xs border-0 focus:outline-none bg-transparent text-slate-700" />
                  {pagos.length > 1 && (
                    <button onClick={() => removePago(i)}
                      className="p-0.5 text-slate-300 hover:text-red-400 rounded transition flex-shrink-0"
                      title="Quitar este pago">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Añadir pago después del último */}
            <button onClick={addPago}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-blue-300 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 transition">
              <Plus className="w-4 h-4" />
              Añadir pago {pagos.length + 1}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex-shrink-0 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!allFilled}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
            {isCopy ? 'Guardar copia' : 'Guardar calendario'}
          </button>
        </div>
      </div>
    </div>
  )
}
