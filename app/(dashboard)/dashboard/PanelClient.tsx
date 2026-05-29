'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MESES_FULL } from '@/lib/types'

// ─── Date helpers (sin timezone) ─────────────────────────────────────────────
// Parsear 'YYYY-MM-DD' directo sin new Date() para evitar problemas UTC
function parseFecha(str: string): { anio: number; mes: number; dia: number } {
  const parts = str.slice(0, 10).split('-').map(Number)
  return { anio: parts[0], mes: parts[1], dia: parts[2] }
}

function mismoMes(fecha: string, anio: number, mes: number) {
  const p = parseFecha(fecha)
  return p.anio === anio && p.mes === mes
}

// ─── Margen: excluye bachillerato completo, y mitad de ambos ─────────────────
function calcMargen(
  movimientos: { tipo: string; categoria: string; monto: number }[],
  anio: number,
  mes: number,
  allMovs: { tipo: string; categoria: string; monto: number; fecha: string }[]
) {
  const ingresosMes = allMovs.filter(m => m.tipo === 'ingreso' && mismoMes(m.fecha, anio, mes))
  const gastosMes   = allMovs.filter(m => m.tipo === 'egreso'  && mismoMes(m.fecha, anio, mes))

  const ingresosMargen = ingresosMes.reduce((s, m) => {
    if (m.categoria === 'bachillerato') return s          // excluir: no es beneficio
    if (m.categoria === 'ambos')        return s + Number(m.monto) / 2  // solo la mitad (colegiatura)
    return s + Number(m.monto)
  }, 0)

  const gastos = gastosMes.reduce((s, m) => s + Number(m.monto), 0)
  return ingresosMargen - gastos
}

const PIE_COLORS = ['#3B82F6','#06B6D4','#8B5CF6','#F59E0B','#10B981','#94A3B8']
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

// ─── Etiquetas de categoría ────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  inscripcion: 'Inscripción', colegiatura: 'Colegiatura',
  bachillerato: 'Bachillerato', ambos: 'Col.+Bachi',
  materiales: 'Materiales', renta: 'Renta', sueldos: 'Sueldos',
  servicios: 'Servicios', mantenimiento: 'Mantenimiento', otros: 'Otros',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PanelClient() {
  const now = new Date()
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)

  const [movimientos, setMovimientos] = useState<{
    id: string; tipo: string; categoria: string; monto: number; fecha: string
  }[]>([])
  const [alumnas, setAlumnas] = useState<{
    id: string; programa: string; cuota_mensual: number
  }[]>([])
  const [pagosCol, setPagosCol] = useState<{
    alumna_id: string; mes: number; estado: string; monto: number
  }[]>([])

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: movs }, { data: al }, { data: pg }] = await Promise.all([
      supabase.from('movimientos_caja').select('id,tipo,categoria,monto,fecha')
        .eq('user_id', user.id),
      supabase.from('alumnas').select('id,programa,cuota_mensual')
        .eq('user_id', user.id).eq('status', 'activa'),
      supabase.from('pagos_colegiaturas').select('alumna_id,mes,estado,monto')
        .eq('user_id', user.id).eq('anio', anio),
    ])

    setMovimientos(movs ?? [])
    setAlumnas(al ?? [])
    setPagosCol(pg ?? [])
    setLoading(false)
  }, [anio])

  useEffect(() => { load() }, [load])

  // ── Cálculos del mes seleccionado ──────────────────────────────────────────
  const ingresosMes = movimientos.filter(m => m.tipo === 'ingreso' && mismoMes(m.fecha, anio, mes))
  const gastosMes   = movimientos.filter(m => m.tipo === 'egreso'  && mismoMes(m.fecha, anio, mes))

  const totalIngresos = ingresosMes.reduce((s, m) => s + Number(m.monto), 0)
  const totalGastos   = gastosMes.reduce((s, m) => s + Number(m.monto), 0)

  const margen = (() => {
    const ingresosSinBachi = ingresosMes.reduce((s, m) => {
      if (m.categoria === 'bachillerato') return s
      if (m.categoria === 'ambos')        return s + Number(m.monto) / 2
      return s + Number(m.monto)
    }, 0)
    return ingresosSinBachi - totalGastos
  })()

  // Cobranza
  const totalEsperado = alumnas
    .filter(a => a.programa === 'colegiaturas' || a.programa === 'ambos')
    .reduce((s, a) => s + Number(a.cuota_mensual), 0)

  const cobradoMes = pagosCol
    .filter(p => p.mes === mes && (p.estado === 'pagado' || p.estado === 'parcial'))
    .reduce((s, p) => s + Number(p.monto), 0)

  const pendienteMes = Math.max(0, totalEsperado - cobradoMes)

  const alumnasPendientes = alumnas.filter(a => {
    const p = pagosCol.find(pg => pg.alumna_id === a.id && pg.mes === mes)
    return !p || p.estado === 'pendiente'
  }).length

  // Ingresos por categoría
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

  // ── Month navigation ────────────────────────────────────────────────────────
  const prevMes = () => { if (mes === 1) { setMes(12); setAnio(y => y - 1) } else setMes(m => m - 1) }
  const nextMes = () => { if (mes === 12) { setMes(1); setAnio(y => y + 1) } else setMes(m => m + 1) }
  const isCurrentMonth = mes === now.getMonth() + 1 && anio === now.getFullYear()

  const mesLabel = MESES_FULL[mes - 1]
  const margenPct = totalIngresos > 0 ? Math.round((margen / totalIngresos) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-5 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `Resumen de ${mesLabel} ${anio}`}
          </p>
        </div>

        {/* Month picker */}
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

      {/* ── KPI Cards ───────────────────────────────────────────── */}
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
        <KpiCard
          title="Cobranza pendiente"
          value={fmt(pendienteMes)}
          badge={`${alumnasPendientes} alumnas`}
          badgeColor={pendienteMes > 0 ? 'amber' : 'emerald'}
          sub={`Cobrado ${fmt(cobradoMes)} de ${fmt(totalEsperado)}`}
          trend="down"
          loading={loading}
        />
      </div>

      {/* ── Charts ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly evolution */}
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
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">
              Sin datos en este período
            </div>
          )}
        </div>

        {/* Income by category */}
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
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm text-center">
              Sin ingresos en {mesLabel}
            </div>
          )}
        </div>
      </div>
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
