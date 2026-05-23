import { createClient } from '@/lib/supabase/server'
import { MESES_FULL } from '@/lib/types'
import PanelClient from './PanelClient'

export const revalidate = 0

export default async function PanelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const anio = now.getFullYear()
  const mes = now.getMonth() + 1

  const [
    { data: ingresos },
    { data: egresos },
    { data: alumnas },
    { data: pagosCol },
  ] = await Promise.all([
    supabase.from('movimientos_caja').select('*').eq('user_id', user!.id).eq('tipo', 'ingreso'),
    supabase.from('movimientos_caja').select('*').eq('user_id', user!.id).eq('tipo', 'egreso'),
    supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user!.id).eq('status', 'activa'),
    supabase.from('pagos_colegiaturas').select('*').eq('user_id', user!.id).eq('anio', anio),
  ])

  const totalIngresosMes = (ingresos ?? [])
    .filter(i => {
      const d = new Date(i.fecha)
      return d.getFullYear() === anio && d.getMonth() + 1 === mes
    })
    .reduce((s, i) => s + Number(i.monto), 0)

  const totalEgresosMes = (egresos ?? [])
    .filter(e => {
      const d = new Date(e.fecha)
      return d.getFullYear() === anio && d.getMonth() + 1 === mes
    })
    .reduce((s, e) => s + Number(e.monto), 0)

  const margenMes = totalIngresosMes - totalEgresosMes

  // Cobranza pendiente
  const alumnaActivas = alumnas ?? []
  const totalEsperadoMes = alumnaActivas
    .filter(a => a.programa === 'colegiaturas' || a.programa === 'ambos')
    .reduce((s, a) => s + Number(a.cuota_mensual), 0)

  const cobradoMes = (pagosCol ?? [])
    .filter(p => p.mes === mes && p.estado === 'pagado')
    .reduce((s, p) => s + Number(p.monto), 0)

  const parcialMes = (pagosCol ?? [])
    .filter(p => p.mes === mes && p.estado === 'parcial')
    .reduce((s, p) => s + Number(p.monto), 0)

  const cobradoTotal = cobradoMes + parcialMes
  const pendienteMes = totalEsperadoMes - cobradoTotal

  const alumnasPendientes = alumnaActivas.filter(a => {
    const pago = (pagosCol ?? []).find(p => p.alumna_id === a.id && p.mes === mes)
    return !pago || pago.estado === 'pendiente'
  }).length

  // Ingresos por canal (categoría)
  const ingresosCategoria: Record<string, number> = {}
  ;(ingresos ?? []).filter(i => {
    const d = new Date(i.fecha)
    return d.getFullYear() === anio && d.getMonth() + 1 === mes
  }).forEach(i => {
    const cat = i.categoria || 'otros'
    ingresosCategoria[cat] = (ingresosCategoria[cat] || 0) + Number(i.monto)
  })

  // Weekly evolution (last 8 weeks)
  const semanas: { semana: string; ingresos: number; gastos: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const label = `${d.getDate()} ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()]}`
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay())
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
    const ing = (ingresos ?? []).filter(m => { const fd = new Date(m.fecha); return fd >= weekStart && fd <= weekEnd }).reduce((s, m) => s + Number(m.monto), 0)
    const eg  = (egresos  ?? []).filter(m => { const fd = new Date(m.fecha); return fd >= weekStart && fd <= weekEnd }).reduce((s, m) => s + Number(m.monto), 0)
    semanas.push({ semana: label, ingresos: ing, gastos: eg })
  }

  const mesLabel = MESES_FULL[mes - 1]

  return (
    <PanelClient
      mesLabel={mesLabel}
      anio={anio}
      margenMes={margenMes}
      totalIngresosMes={totalIngresosMes}
      totalEgresosMes={totalEgresosMes}
      pendienteMes={pendienteMes}
      cobradoTotal={cobradoTotal}
      totalEsperadoMes={totalEsperadoMes}
      alumnasPendientes={alumnasPendientes}
      ingresosCategoria={ingresosCategoria}
      semanas={semanas}
      movimientosCount={(ingresos ?? []).filter(i => { const d = new Date(i.fecha); return d.getFullYear() === anio && d.getMonth() + 1 === mes }).length}
      egresosCount={(egresos ?? []).filter(e => { const d = new Date(e.fecha); return d.getFullYear() === anio && d.getMonth() + 1 === mes }).length}
    />
  )
}
