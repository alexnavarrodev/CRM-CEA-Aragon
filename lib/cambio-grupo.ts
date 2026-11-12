// Cálculo PURO para el cambio de grupo de una alumna (sin React ni Supabase).
//
// Al cambiar de grupo, la cuadrícula de pagos del grupo anterior ya no sirve: se
// ancla al registro de pago más antiguo de la alumna, así que sus meses viejos
// desplazan la cuadrícula del grupo nuevo y le inventan adeudo. Por eso se reinicia.
// Los meses que van desde el arranque del grupo nuevo hasta que ella EMPIEZA A PAGAR
// se marcan $0/pagado ("exentos"), que es como el sistema entiende "saldado".
import { TIPOS_BACHI } from './acumulacion'

export interface AnioMes { anio: number; mes: number }

const FIN: AnioMes = { anio: 2027, mes: 12 } // mismo tope que las cuadrículas
const INICIO_MIN: AnioMes = { anio: 2025, mes: 11 }

const idx = (m: AnioMes) => m.anio * 12 + (m.mes - 1)
const desdeIdx = (i: number): AnioMes => ({ anio: Math.floor(i / 12), mes: (i % 12) + 1 })

/** Meses anteriores a `empiezaEn`, a partir del arranque del grupo nuevo. */
export function mesesExentos(inicioGrupo: AnioMes, empiezaEn: AnioMes): AnioMes[] {
  const out: AnioMes[] = []
  const desde = Math.max(idx(inicioGrupo), idx(INICIO_MIN))
  for (let i = desde; i < idx(empiezaEn); i++) out.push(desdeIdx(i))
  return out
}

/** Meses entre los que puede elegir "empieza a pagar": del arranque del grupo a dic 2027. */
export function opcionesEmpiezaEn(inicioGrupo: AnioMes): AnioMes[] {
  const out: AnioMes[] = []
  for (let i = Math.max(idx(inicioGrupo), idx(INICIO_MIN)); i <= idx(FIN); i++) out.push(desdeIdx(i))
  return out
}

/** Tipos de bachillerato que son MES (no 'inscripcion'/'materiales', que son de la alumna). */
export const TIPOS_BACHI_MES: string[] = [...TIPOS_BACHI]
