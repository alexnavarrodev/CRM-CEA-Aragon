'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import { CANAL_LABELS } from '@/lib/types'

const PIE_COLORS = ['#3B82F6','#06B6D4','#8B5CF6','#F59E0B','#94A3B8']

const fmt = (n: number) => `$${n.toLocaleString('es-MX')}`

interface Props {
  mesLabel: string; anio: number
  margenMes: number; totalIngresosMes: number; totalEgresosMes: number
  pendienteMes: number; cobradoTotal: number; totalEsperadoMes: number
  alumnasPendientes: number; ingresosCategoria: Record<string, number>
  semanas: { semana: string; ingresos: number; gastos: number }[]
  movimientosCount: number; egresosCount: number
}

export default function PanelClient({
  mesLabel, anio, margenMes, totalIngresosMes, totalEgresosMes,
  pendienteMes, cobradoTotal, totalEsperadoMes, alumnasPendientes,
  ingresosCategoria, semanas, movimientosCount, egresosCount,
}: Props) {
  const margenPct = totalIngresosMes > 0 ? Math.round((margenMes / totalIngresosMes) * 100) : 0
  const pie = Object.entries(ingresosCategoria).map(([k, v]) => ({
    name: CANAL_LABELS[k] || k,
    value: v,
    pct: totalIngresosMes > 0 ? Math.round((v / totalIngresosMes) * 100) : 0,
  }))

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel del mes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Resumen de {mesLabel} {anio} · actualizado al {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['Este mes', '3 meses', 'Año'].map((t, i) => (
            <button key={t} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${i === 0 ? 'bg-white border border-slate-200 text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              {t}
            </button>
          ))}
          <button className="flex items-center gap-1.5 px-4 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-white transition shadow-sm ml-2">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="Margen del mes"
          value={fmt(margenMes)}
          badge={`${margenPct}% margen`}
          badgeColor="emerald"
          sub="Vas en números negros"
          icon={<TrendingUp className="w-4 h-4" />}
          trend={margenMes > 0 ? 'up' : 'down'}
        />
        <KpiCard
          title="Ingresos del mes"
          value={fmt(totalIngresosMes)}
          badge={`${movimientosCount} movimientos registrados`}
          badgeColor="blue"
          sub={`${movimientosCount} movimientos`}
          icon={<TrendingUp className="w-4 h-4" />}
          trend="up"
        />
        <KpiCard
          title="Gastos del mes"
          value={fmt(totalEgresosMes)}
          badge={`${egresosCount} salidas registradas`}
          badgeColor="red"
          sub={`${egresosCount} salidas`}
          icon={<TrendingDown className="w-4 h-4" />}
          trend="down"
        />
        <KpiCard
          title="Cobranza pendiente"
          value={fmt(pendienteMes)}
          badge={`${alumnasPendientes} alumnas con saldo`}
          badgeColor="red"
          sub={`Cobrado ${fmt(cobradoTotal)} de ${fmt(totalEsperadoMes)}`}
          icon={<TrendingDown className="w-4 h-4" />}
          trend="down"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Weekly evolution */}
        <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="mb-1">
            <h2 className="font-semibold text-slate-800">Evolución semanal</h2>
            <p className="text-xs text-slate-400">Ingresos vs. gastos por semana</p>
          </div>
          <div className="flex items-center gap-4 mt-2 mb-4">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /><span className="text-xs text-slate-500">Ingresos</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /><span className="text-xs text-slate-500">Gastos</span></div>
          </div>
          {semanas.some(s => s.ingresos > 0 || s.gastos > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={semanas} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(Number(v))} labelStyle={{ color: '#334155' }} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <Line type="monotone" dataKey="ingresos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="gastos"   stroke="#94A3B8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">Sin datos aún — registra movimientos en Caja</div>
          )}
        </div>

        {/* Income by channel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-800">Ingresos por canal</h2>
            <p className="text-xs text-slate-400">De dónde está entrando el dinero</p>
          </div>
          {pie.length > 0 ? (
            <>
              <div className="flex items-center justify-center">
                <PieChart width={160} height={160}>
                  <Pie data={pie} cx={75} cy={75} innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <text x={80} y={72} textAnchor="middle" dominantBaseline="middle" className="text-lg font-bold" style={{ fontSize: 16, fontWeight: 700, fill: '#0F172A' }}>
                    {fmt(totalIngresosMes).replace('$','')}
                  </text>
                  <text x={80} y={91} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fill: '#94A3B8' }}>Total mes</text>
                </PieChart>
              </div>
              <div className="mt-2 space-y-1.5">
                {pie.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{fmt(item.value)}</span>
                      <span className="text-slate-400 text-xs w-8 text-right">{item.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm text-center">Sin ingresos este mes</div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, badge, badgeColor, sub, trend }: {
  title: string; value: string; badge: string; badgeColor: string; sub: string; icon?: React.ReactNode; trend: 'up' | 'down'
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue:    'bg-blue-50 text-blue-700',
    red:     'bg-red-50 text-red-600',
    amber:   'bg-amber-50 text-amber-700',
  }
  const badgeStyle = colors[badgeColor as keyof typeof colors] || colors.blue
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-slate-500 text-sm mb-1">{title}</p>
      <p className="text-[28px] font-bold text-slate-900 leading-none">{value}</p>
      <div className={`inline-flex items-center gap-1 mt-2.5 px-2.5 py-1 rounded-lg text-xs font-medium ${badgeStyle}`}>
        {trend === 'up' ? '↑' : '↓'} {badge}
      </div>
      <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
    </div>
  )
}
