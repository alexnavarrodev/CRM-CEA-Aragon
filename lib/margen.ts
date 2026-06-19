// Cálculo de margen — lógica del bachillerato.
//
// El bachillerato SÍ deja ganancia. Tramitar el bachillerato de una alumna le
// cuesta a la escuela BACHI_COSTO; por eso, de los pagos de bachillerato de cada
// alumna, los primeros BACHI_COSTO ACUMULADOS son costo (no cuentan al margen) y
// todo lo que pague de ahí en adelante es ganancia. No tiene que ser un solo
// pago: cuenta el acumulado por alumna a lo largo de los meses.
//
// El "pago de bachillerato" de un movimiento = categoría 'bachillerato' completo
// + la mitad de 'ambos' (la otra mitad es colegiatura).

export const BACHI_COSTO = 5000

export interface MovMargen {
  alumna_id: string | null
  categoria: string
  monto: number
  fecha: string // 'YYYY-MM-DD...' — se compara por string (evita desfase UTC)
}

// Monto que un movimiento aporta al "bachillerato" de la alumna.
function montoBachi(m: MovMargen): number {
  if (m.categoria === 'bachillerato') return Number(m.monto)
  if (m.categoria === 'ambos')        return Number(m.monto) / 2
  return 0
}

// Ganancia de bachillerato del mes [anio, mes] (mes 1-12): por alumna, la parte
// de sus pagos de bachillerato DENTRO del mes que queda por encima del umbral
// BACHI_COSTO acumulado (contando lo ya pagado en meses anteriores).
//
// `ingresos` debe ser TODOS los movimientos de ingreso (de todos los meses), no
// sólo los del mes, para poder acumular correctamente.
export function gananciaBachiDelMes(ingresos: MovMargen[], anio: number, mes: number): number {
  const ym = `${anio}-${String(mes).padStart(2, '0')}`
  // Agrupa por alumna (los movimientos sin alumna comparten un bucket aparte).
  const porAlumna = new Map<string, MovMargen[]>()
  for (const m of ingresos) {
    if (montoBachi(m) <= 0) continue
    const key = m.alumna_id ?? '__sin_alumna__'
    const arr = porAlumna.get(key)
    if (arr) arr.push(m); else porAlumna.set(key, [m])
  }

  let total = 0
  for (const movs of porAlumna.values()) {
    let cumAntes = 0  // acumulado de meses ANTERIORES al mes objetivo
    let cumMes = 0    // acumulado DENTRO del mes objetivo
    for (const m of movs) {
      const mYm = m.fecha.slice(0, 7)
      if (mYm < ym) cumAntes += montoBachi(m)
      else if (mYm === ym) cumMes += montoBachi(m)
    }
    const cumThrough = cumAntes + cumMes
    // Ganancia del mes = (lo que pasó el umbral hasta este mes) − (lo que ya lo
    // había pasado antes). Es independiente del orden dentro del mes.
    total += Math.max(0, cumThrough - BACHI_COSTO) - Math.max(0, cumAntes - BACHI_COSTO)
  }
  return total
}
