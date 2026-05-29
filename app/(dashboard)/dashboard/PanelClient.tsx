'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MESES_FULL, MESES } from '@/lib/types'

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseFecha(str: string): { anio: number; mes: number; dia: number } {
  const parts = str.slice(0, 10).split('-').map(Number)
  return { anio: parts[0], mes: parts[1], dia: parts[2] }
}
function mismoMes(fecha: string, anio: number, mes: number) {
  const p = parseFecha(fecha)
  return p.anio === anio && p.mes === mes
}

// Genera lista de meses (anio,mes) desde [startY,startM] hasta [endY,endM] inclusive
function mesesEntre(startY: number, startM: number, endY: number, endM: number) {
  const out: { anio: number; mes: number }[] = []
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ anio: y, mes: m })
    m++; if (m > 13) { m = 1; y++ }
    if (m === 13) { m = 1; y++ }
  }
  return out
}

// ─── Margen ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#3B82F6','#06B6D4','#8B5CF6','#F59E0B','#10B981','#94A3B8']
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
const CAT_LABELS: Record<string, string> = {
  inscripcion: 'Inscripción', colegiatura: 'Colegiatura',
  bachillerato: 'Bachillerato', ambos: 'Col.+Bachi',
  materiales: 'Materiales', renta: 'Renta', sueldos: 'Sueldos',
  servicios: 'Servicios', mantenimiento: 'Mantenimiento', otros: 'Otros',
}
const MES_LABELS = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlumnaRow { id: string; nombre: string; programa: string; cuota_mensual: number }
interface PagoCol   { alumna_id: string; anio: number; mes: number; estado: string; monto: number }

interface PendingStudent {
  alumna: AlumnaRow
  pendingMonths: { anio: number; mes: number }[]   // todos los meses sin pagar
  totalDebt: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PanelClient() {
  const now = new Date()
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [cobranzaOpen, setCobranzaOpen] = useState(false)

  const [movimientos, setMovimientos] = useState<{
    id: string; tipo: string; categoria: string; monto: number; fecha: string
  }[]>([])
  const [alumnas, setAlumnas]   = useState<AlumnaRow[]>([])
  const [pagosCol, setPagosCol] = useState<PagoCol[]>([])

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: movs }, { data: al }, { data: pg }] = await Promise.all([
      supabase.from('movimientos_caja').select('id,tipo,categoria,monto,fecha')
        .eq('user_id', user.id),
      // ← ahora incluye 'nombre'
      supabase.from('alumnas').select('id,nombre,programa,cuota_mensual')
        .eq('user_id', user.id).eq('status', 'activa'),
      // ← carga todos los años ≥ 2025 para detectar deudas anteriores
      supabase.from('pagos_colegiaturas').select('alumna_id,anio,mes,estado,monto')
        .eq('user_id', user.id).gte('anio', 2025),
    ])

    setMovimientos(movs ?? [])
    setAlumnas(al ?? [])
    setPagosCol(pg ?? [])
    setLoading(false)
  }, [anio])

  useEffect(() => { load() }, [load])

  // ── KPIs del mes seleccionado ─────────────────────────────────────────────
  const ingresosMes = movimientos.filter(m => m.tipo === 'ingreso' && mismoMes(m.fecha, anio, mes))
  const gastosMes   = movimientos.filter(m => m.tipo === 'egreso'  && mismoMes(m.fecha, anio, mes))
  const totalIngresos = ingresosMes.reduce((s, m) => s + Number(m.monto), 0)
  const totalGastos   = gastosMes.reduce((s, m) => s + Number(m.monto), 0)

  const margen = (() => {
    const sinBachi = ingresosMes.reduce((s, m) => {
      if (m.categoria === 'bachillerato') return s
      if (m.categoria === 'ambos')        return s + Number(m.monto) / 2
      return s + Number(m.monto)
    }, 0)
    return sinBachi - totalGastos
  })()

  // ── Cobranza pendiente ────────────────────────────────────────────────────
  // Para cada alumna activa en colegiaturas/ambos, detectar meses sin pagar
  // desde su primer pago registrado hasta el mes seleccionado.
  const alumnasColegiatura = alumnas.filter(
    a => a.programa === 'colegiaturas' || a.programa === 'ambos'
  )

  const pendingDetails: PendingStudent[] = alumnasColegiatura.map(alumna => {
    const pagosPropios = pagosCol.filter(p => p.alumna_id === alumna.id)

    // Mes inicio: el más antiguo con pago registrado (pagado o pendiente).
    // Si no tiene ninguno, usar el mes seleccionado (solo mostrar ese mes).
    let startAnio = anio, startMes = mes
    if (pagosPropios.length > 0) {
      const earliest = pagosPropios.reduce((min, p) => {
        const val = p.anio * 100 + p.mes
        return val < min.val ? { val, anio: p.anio, mes: p.mes } : min
      }, { val: Infinity, anio, mes })
      startAnio = earliest.anio
      startMes  = earliest.mes
    }

    // Meses a verificar: desde startAnio/startMes hasta anio/mes
    const meses = mesesEntre(startAnio, startMes, anio, mes)

    // Filtrar los meses que NO tienen pago pagado ni parcial
    const pendingMonths = meses.filter(({ anio: y, mes: m }) => {
      const pago = pagosPropios.find(p => p.anio === y && p.mes === m)
      return !pago || pago.estado === 'pendiente'
    })

    const totalDebt = pendingMonths.length * Number(alumna.cuota_mensual)
    return { alumna, pendingMonths, totalDebt }
  })
  .filter(s => s.pendingMonths.length > 0)
  .sort((a, b) => b.totalDebt - a.totalDebt)

  // KPI values
  const totalEsperado = alumnasColegiatura.reduce((s, a) => s + Number(a.cuota_mensual), 0)
  const cobradoMes = pagosCol
    .filter(p => p.anio === anio && p.mes === mes &&
      (p.estado === 'pagado' || p.estado === 'parcial'))
    .reduce((s, p) => s + Number(p.monto), 0)
  const pendienteMes     = Math.max(0, totalEsperado - cobradoMes)
  const alumnasPendientes = pendingDetails.length

  // Ingresos por categoría (gráfico)
  const ingCat: Record<string, number> = {}
  ingresosMes.forEach(m => {
    const k = m.categoria || 'otros'
    ingCat[k] = (ingCat[k] || 0) + Number(m.monto)
  })
  const pie = Object.entries(ingCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({
      name: CAT_LABELS[k] || k,
      value: v,
      pct: totalIngresos > 0 ? Math.round((v / totalIngresos) * 100) : 0,
    }))

  // Evolución semanal (últimas 8 semanas)
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (7 - i) * 7)
    const label = `${d.getDate()} ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()]}`
    const wStart = new Date(d); wStart.setDate(d.getDate() - d.getDay())
    const wEnd   = new Date(wStart); wEnd.setDate(wStart.getDate() + 6)
    const ing = movimientos.filter(m => {
      const { anio: y, mes: mo, dia } = parseFecha(m.fecha)
      const fd = new Date(y, mo - 1, dia)
      return m.tipo === 'ingreso' && fd >= wStart && fd <= wEnd
    }).reduce((s, m) => s + Number(m.monto), 0)
    const eg = movimientos.filter(m => {
      const { anio: y, mes: mo, dia } = parseFecha(m.fecha)
      const fd = new Date(y, mo - 1, dia)
      return m.tipo === 'egreso' && fd >= wStart && fd <= wEnd
    }).reduce((s, m) => s + Number(m.monto), 0)
    return { semana: label, ingresos: ing, gastos: eg }
  })

  // Month nav
  const prevMes = () => { if (mes === 1) { setMes(12); setAnio(y => y - 1) } else setMes(m => m - 1) }
  const nextMes = () => { if (mes === 12) { setMes(1); setAnio(y => y + 1) } else setMes(m => m + 1) }
  const isCurrentMonth = mes === now.getMonth() + 1 && anio === now.getFullYear()
  const mesLabel  = MESES_FULL[mes - 1]
  const margenPct = totalIngresos > 0 ? Math.round((margen / totalIngresos) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-5 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `Resumen de ${mesLabel} ${anio}`}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-2 py-1.5">
          <button onClick={prevMes} className="p-1.5 rounded-lg hover:bg-white transition text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-700 capitalize min-w-[130px] text-center">
            {mesLabel} {anio}
          </span>
          <button onClick={nextMes} disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-white transition text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          title="Margen del mes"
          subtitle="(sin bachillerato)"
          value={fmt(margen)}
          badge={`${margenPct}% del ingreso`}
          badgeColor={margen >= 0 ? 'emerald' : 'red'}
          trend={margen >= 0 ? 'up' : 'down'}
          loading={loading}
        />
        <KpiCard
          title="Ingresos del mes"
          value={fmt(totalIngresos)}
          badge={`${ingresosMes.length} movimientos`}
          badgeColor="blue"
          trend="up"
          loading={loading}
        />
        <KpiCard
          title="Gastos del mes"
          value={fmt(totalGastos)}
          badge={`${gastosMes.length} salidas`}
          badgeColor="red"
          trend="down"
          loading={loading}
        />
        {/* ← Cobranza pendiente: clickable */}
        <button
          onClick={() => !loading && setCobranzaOpen(true)}
          className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 hover:border-orange-300 hover:shadow-md transition group"
        >
          <p className="text-slate-500 text-sm group-hover:text-orange-600 transition">
            Cobranza pendiente
          </p>
          <p className={`text-[26px] md:text-[28px] font-bold leading-none mt-1 ${loading ? 'text-slate-200 animate-pulse' : 'text-slate-900'}`}>
            {loading ? '···' : fmt(pendienteMes)}
          </p>
          <div className={`inline-flex items-center gap-1 mt-2.5 px-2.5 py-1 rounded-lg text-xs font-medium
            ${pendienteMes > 0 ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {pendienteMes > 0
              ? <><AlertCircle className="w-3 h-3" /> {alumnasPendientes} alumnas pendientes — ver lista</>
              : <><TrendingUp className="w-3 h-3" /> Todo al día</>
            }
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Cobrado {fmt(cobradoMes)} de {fmt(totalEsperado)}
          </p>
        </button>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800">Evolución semanal</h2>
          <p className="text-xs text-slate-400 mb-4">Ingresos vs. gastos por semana (últimas 8 semanas)</p>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs text-slate-500">Ingresos</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /><span className="text-xs text-slate-500">Gastos</span></div>
          </div>
          {semanas.some(s => s.ingresos > 0 || s.gastos > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={semanas} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(Number(v))} labelStyle={{ color: '#334155' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <Line type="monotone" dataKey="ingresos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="gastos"   stroke="#94A3B8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">Sin datos en este período</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800">Ingresos por categoría</h2>
          <p className="text-xs text-slate-400 mb-4">De dónde está entrando el dinero</p>
          {pie.length > 0 ? (
            <>
              <div className="flex items-center justify-center">
                <PieChart width={160} height={160}>
                  <Pie data={pie} cx={75} cy={75} innerRadius={50} outerRadius={70}
                    dataKey="value" paddingAngle={2}>
                    {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <text x={80} y={72} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 16, fontWeight: 700, fill: '#0F172A' }}>
                    {fmt(totalIngresos).replace('$','')}
                  </text>
                  <text x={80} y={91} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 10, fill: '#94A3B8' }}>Total mes</text>
                </PieChart>
              </div>
              <div className="mt-2 space-y-1.5">
                {pie.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600 text-xs">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700 text-sm">{fmt(item.value)}</span>
                      <span className="text-slate-400 text-xs w-8 text-right">{item.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm text-center">Sin ingresos en {mesLabel}</div>
          )}
        </div>
      </div>

      {/* ── Cobranza Modal ───────────────────────────────────────────── */}
      {cobranzaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setCobranzaOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Cobranza pendiente</h3>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{mesLabel} {anio} · {alumnasPendientes} alumnas</p>
              </div>
              <button onClick={() => setCobranzaOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {pendingDetails.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400 text-sm">¡Todo al día! No hay cobranza pendiente</p>
                </div>
              ) : (
                <ul>
                  {pendingDetails.map(({ alumna, pendingMonths, totalDebt }, i) => {
                    // Separar mes actual de meses anteriores
                    const currentMonthPending = pendingMonths.some(
                      m => m.anio === anio && m.mes === mes
                    )
                    const pastMonths = pendingMonths.filter(
                      m => !(m.anio === anio && m.mes === mes)
                    )

                    return (
                      <li key={alumna.id}
                        className={`px-5 py-4 flex items-start justify-between gap-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm">{alumna.nombre}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {/* Mes actual */}
                            {currentMonthPending && (
                              <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-orange-100 text-orange-700">
                                {MES_LABELS[mes]} {anio}
                              </span>
                            )}
                            {/* Meses anteriores */}
                            {pastMonths.map(m => (
                              <span key={`${m.anio}-${m.mes}`}
                                className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-red-50 text-red-600">
                                {MES_LABELS[m.mes]} {m.anio}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-slate-800 text-sm">{fmt(totalDebt)}</p>
                          <p className="text-[11px] text-slate-400">
                            {pendingMonths.length} {pendingMonths.length === 1 ? 'mes' : 'meses'}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer total */}
            {pendingDetails.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <p className="text-sm text-slate-500">Total pendiente</p>
                <p className="text-lg font-bold text-orange-600">
                  {fmt(pendingDetails.reduce((s, d) => s + d.totalDebt, 0))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ title, subtitle, value, badge, badgeColor, sub, trend, loading }: {
  title: string; subtitle?: string; value: string; badge: string
  badgeColor: string; sub?: string; trend: 'up' | 'down'; loading?: boolean
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue:    'bg-blue-50 text-blue-700',
    red:     'bg-red-50 text-red-600',
    amber:   'bg-amber-50 text-amber-700',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5">
      <p className="text-slate-500 text-sm">{title}</p>
      {subtitle && <p className="text-slate-400 text-[10px]">{subtitle}</p>}
      <p className={`text-[26px] md:text-[28px] font-bold text-slate-900 leading-none mt-1 ${loading ? 'animate-pulse text-slate-200' : ''}`}>
        {loading ? '···' : value}
      </p>
      <div className={`inline-flex items-center gap-1 mt-2.5 px-2.5 py-1 rounded-lg text-xs font-medium ${colors[badgeColor] || colors.blue}`}>
        {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {badge}
      </div>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}
