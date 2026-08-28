// ============================================================================
// lib/recargos.ts — Recargo por pago tardío de colegiatura. Lógica PURA.
//
// Regla de negocio (Alex, 28 ago 2026):
//   Si pasan más de 2 semanas desde la fecha de pago que le toca a su grupo, esa
//   mensualidad suma un 10% de recargo.
//
//   · Es POR MES atrasado: cada mensualidad que se pase de las 2 semanas suma su
//     propio 10%. Si debe julio y agosto y sólo julio se pasó, el recargo es de
//     julio; cuando agosto también se pase, se suma el suyo.
//   · SÓLO sobre la colegiatura. El bachillerato nunca genera recargo (por eso aquí
//     sólo entra el adeudo de `mesesAdeudadosCol`, cuyo tope ya es la parte de
//     colegiatura: $1,000 en las alumnas de programa 'ambos').
//   · Se calcula sobre lo que queda a deber de ese mes, así que si ya abonó una
//     parte, el recargo baja en proporción.
//
// La fecha de pago de cada mes sale del calendario de su grupo
// (`grupos.calendario_id` → app_kv `payment_calendars_v2`).
// ============================================================================

import type { PaymentCalendar } from './nomina'
import { fechasDelCalendario, parseISO } from './nomina'

export const RECARGO_PCT = 0.10
export const RECARGO_DIAS_GRACIA = 14

const aISO = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Fecha de pago del calendario que corresponde a un mes concreto ('YYYY-MM-DD'). */
export function fechaPagoDeMes(
  cal: PaymentCalendar | null | undefined, anio: number, mes: number,
): string | null {
  if (!cal) return null
  for (const ms of fechasDelCalendario(cal)) {
    const d = new Date(ms)
    if (d.getUTCFullYear() === anio && d.getUTCMonth() + 1 === mes) return aISO(ms)
  }
  return null
}

/** Próxima fecha de pago a partir de hoy (incluida). La que se le muestra a la alumna. */
export function proximaFechaPago(
  cal: PaymentCalendar | null | undefined, hoyISO: string,
): string | null {
  const hoy = parseISO(hoyISO)
  if (hoy === null || !cal) return null
  for (const ms of fechasDelCalendario(cal)) if (ms >= hoy) return aISO(ms)
  return null
}

export interface RecargoMes {
  anio: number
  mes: number
  falta: number
  /** Fecha en que le tocaba pagar ese mes. Null si su calendario no la tiene. */
  fechaLimite: string | null
  diasTarde: number
  /** 10% de `falta`, o 0 si aún no se pasa de las 2 semanas. */
  recargo: number
}

export interface MesAdeudadoCol { anio: number; mes?: number; falta: number }

/**
 * Recargo de cada mes de colegiatura adeudado.
 * Si el grupo no tiene calendario, o el mes no está en él, no se cobra recargo
 * (nunca se inventa una fecha límite).
 */
export function recargosColegiatura(
  cal: PaymentCalendar | null | undefined,
  adeudoCol: MesAdeudadoCol[],
  hoyISO: string,
): RecargoMes[] {
  const hoy = parseISO(hoyISO)
  return adeudoCol
    .filter(m => m.mes != null)
    .map(m => {
      const fechaLimite = fechaPagoDeMes(cal, m.anio, m.mes!)
      const lim = fechaLimite ? parseISO(fechaLimite) : null
      const diasTarde = (hoy !== null && lim !== null)
        ? Math.max(0, Math.floor((hoy - lim) / 86400000)) : 0
      const aplica = diasTarde > RECARGO_DIAS_GRACIA
      return {
        anio: m.anio, mes: m.mes!, falta: m.falta, fechaLimite, diasTarde,
        recargo: aplica ? Math.round(m.falta * RECARGO_PCT) : 0,
      }
    })
}

/** Suma de los recargos aplicables. */
export function totalRecargo(recargos: RecargoMes[]): number {
  return recargos.reduce((s, r) => s + r.recargo, 0)
}
