import { createClient } from '@/lib/supabase/server'
import { MESES, MESES_FULL } from '@/lib/types'
import { BarChart2, TrendingUp, Users, GraduationCap, Wallet } from 'lucide-react'

export const revalidate = 0

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const anio = new Date().getFullYear()

  const [
    { data: alumnas },
    { data: pagosCol },
    { data: ingresos },
    { data: egresos },
  ] = await Promise.all([
    supabase.from('alumnas').select('*').eq('user_id', user.id),
    supabase.from('pagos_colegiaturas').select('*').eq('user_id', user.id).eq('anio', anio),
    supabase.from('movimientos_caja').select('*').eq('user_id', user.id).eq('tipo', 'ingreso'),
    supabase.from('movimientos_caja').select('*').eq('user_id', user.id).eq('tipo', 'egreso'),
  ])

  const al = alumnas ?? []
  const pg = pagosCol ?? []
  const ing = ingresos ?? []
  const eg = egresos ?? []

  // Alumnas stats
  const totalAlumnas = al.filter(a => a.status === 'activa').length
  const totalEgresadas = al.filter(a => a.status === 'egresada').length
  const totalBajas = al.filter(a => a.status === 'baja').length
  const promedioProm = al.length > 0 ? (al.reduce((s, a) => s + Number(a.promedio), 0) / al.length).toFixed(1) : '0'
  const promedioAsist = al.length > 0 ? Math.round(al.reduce((s, a) => s + Number(a.asistencia_pct), 0) / al.length) : 0

  // Cobranza anual por mes
  const cobranzaMes = MESES.map((_, i) => {
    const mes = i + 1
    return pg.filter(p => p.mes === mes && p.estado === 'pagado').reduce((s, p) => s + Number(p.monto), 0)
  })
  const totalCobradoAnio = cobranzaMes.reduce((a, b) => a + b, 0)

  // Ingresos / egresos por mes
  const ingresosMes = MESES.map((_, i) => {
    const mes = i + 1
    return ing.filter(m => {
      const d = new Date(m.fecha)
      return d.getFullYear() === anio && d.getMonth() + 1 === mes
    }).reduce((s, m) => s + Number(m.monto), 0)
  })
  const egresosMes = MESES.map((_, i) => {
    const mes = i + 1
    return eg.filter(m => {
      const d = new Date(m.fecha)
      return d.getFullYear() === anio && d.getMonth() + 1 === mes
    }).reduce((s, m) => s + Number(m.monto), 0)
  })

  const totalIngresos = ingresosMes.reduce((a, b) => a + b, 0)
  const totalEgresos  = egresosMes.reduce((a, b) => a + b, 0)
  const margenAnual   = totalIngresos - totalEgresos

  const maxBar = Math.max(...ingresosMes, ...egresosMes, 1)

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-400 mt-0.5">Resumen anual {anio}</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alumnas activas</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalAlumnas}</p>
          <p className="text-xs text-slate-400 mt-1">{totalEgresadas} egresadas · {totalBajas} bajas</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingresos anuales</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">${totalIngresos.toLocaleString('es-MX')}</p>
          <p className="text-xs text-slate-400 mt-1">Margen: ${margenAnual.toLocaleString('es-MX')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Colegiaturas cobradas</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">${totalCobradoAnio.toLocaleString('es-MX')}</p>
          <p className="text-xs text-slate-400 mt-1">Del año {anio}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Promedio académico</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{promedioProm}</p>
          <p className="text-xs text-slate-400 mt-1">Asistencia: {promedioAsist}%</p>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-1">Ingresos vs. Egresos — {anio}</h2>
        <p className="text-xs text-slate-400 mb-6">Flujo mensual de caja</p>
        <div className="flex items-end gap-1.5" style={{ height: 180 }}>
          {MESES.map((mes, i) => {
            const ing = ingresosMes[i]
            const eg = egresosMes[i]
            const hIng = ing > 0 ? Math.max(4, Math.round((ing / maxBar) * 160)) : 4
            const hEg  = eg  > 0 ? Math.max(4, Math.round((eg  / maxBar) * 160)) : 4
            return (
              <div key={mes} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 160 }}>
                  <div className="flex-1 rounded-t-sm bg-blue-500" style={{ height: hIng }} title={`Ingresos: $${ing.toLocaleString('es-MX')}`} />
                  <div className="flex-1 rounded-t-sm bg-red-300"  style={{ height: hEg  }} title={`Egresos: $${eg.toLocaleString('es-MX')}`} />
                </div>
                <span className="text-[10px] text-slate-400">{mes}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /><span className="text-xs text-slate-500">Ingresos</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-300  inline-block" /><span className="text-xs text-slate-500">Egresos</span></div>
        </div>
      </div>

      {/* Cobranza mensual */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-1">Cobranza de colegiaturas — {anio}</h2>
        <p className="text-xs text-slate-400 mb-4">Monto pagado por mes</p>
        <div className="space-y-2.5">
          {MESES.map((mes, i) => {
            const monto = cobranzaMes[i]
            const maxMes = Math.max(...cobranzaMes, 1)
            const pct = Math.round((monto / maxMes) * 100)
            return (
              <div key={mes} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-8">{mes}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-medium text-slate-700 w-24 text-right">${monto.toLocaleString('es-MX')}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
