// ============================================================================
// lib/nomina.ts — Sueldo de las docentes. Lógica PURA (sin React ni Supabase).
//
// Regla de negocio (confirmada por Alex y comprobada contra los pagos reales
// registrados en Caja, ago 2026):
//
//   sueldo = $75 × alumnas activas del grupo × semanas HASTA el próximo pago
//
// Las "semanas" salen del calendario de pagos del grupo (`payment_calendars_v2`
// en app_kv): es la distancia entre la fecha de pago actual y la SIGUIENTE.
// Por eso un mismo grupo paga distinto según el mes (4 o 5 semanas), y una misma
// docente cobra distinto en cada grupo que da.
//
// Comprobaciones contra Caja:
//   VMX  6 alumnas × 4 sem × 75 = $1,800  (Ximena, 21 ago) ✓
//   SMX  8 alumnas × 4 sem × 75 = $2,400  (Ximena, 15 ago) ✓
//   VMLC 11 alumnas × 5 sem × 75 = $4,125 (Lizbeth, 14 ago) ✓
//   SVLE 8 alumnas × 5 sem × 75 = $3,000  (Luis, 15 ago) ✓
//   SMA  7 alumnas × 4 sem × 75 = $2,100  (Ángeles, 22 ago) ✓
// ============================================================================

export const TARIFA_POR_ALUMNA_SEMANA = 75

export interface PaymentCalendar {
  id: string
  nombre: string
  color: string
  inicio: string   // 'DD/MM/YYYY'
  pagos: string[]  // 'DD/MM/YYYY'
  liqCertIndex: number
}

/** 'DD/MM/YYYY' → epoch ms en UTC. No usa `new Date(str)` para evitar el
 *  desfase de zona horaria que corre las fechas un día en UTC−6. */
export function parseDMY(s: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s?.trim() ?? '')
  if (!m) return null
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

/** 'YYYY-MM-DD' → epoch ms en UTC. */
export function parseISO(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim() ?? '')
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Todas las fechas del calendario en orden: el inicio cuenta como fecha de pago
 *  (el primer sueldo se paga el día que arranca el grupo). */
export function fechasDelCalendario(cal: PaymentCalendar): number[] {
  return [cal.inicio, ...cal.pagos]
    .map(parseDMY)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)
}

export interface TramoNomina {
  /** Semanas hasta el próximo pago (base del cálculo). */
  semanas: number
  /** Fecha del siguiente pago, 'YYYY-MM-DD'. Null si es el último del calendario. */
  proximaFecha: string | null
}

/** Si `fechaISO` es una fecha de pago del calendario, devuelve cuántas semanas
 *  faltan hasta la siguiente. Si no es fecha de pago, devuelve null. */
export function tramoEnFecha(cal: PaymentCalendar, fechaISO: string): TramoNomina | null {
  const hoy = parseISO(fechaISO)
  if (hoy === null) return null
  const fechas = fechasDelCalendario(cal)
  const i = fechas.indexOf(hoy)
  if (i === -1) return null
  const siguiente = fechas[i + 1]
  if (siguiente === undefined) return { semanas: 0, proximaFecha: null }
  const semanas = Math.round((siguiente - hoy) / (7 * 86400000))
  return {
    semanas,
    proximaFecha: new Date(siguiente).toISOString().slice(0, 10),
  }
}

export interface SueldoCalculado {
  monto: number
  semanas: number
  alumnas: number
  proximaFecha: string | null
}

/** Sueldo de la docente de un grupo en una fecha de pago concreta.
 *  Devuelve null si ese día no toca pago para ese calendario. */
export function sueldoDocente(
  cal: PaymentCalendar, fechaISO: string, alumnasActivas: number,
): SueldoCalculado | null {
  const tramo = tramoEnFecha(cal, fechaISO)
  if (!tramo) return null
  return {
    monto: TARIFA_POR_ALUMNA_SEMANA * alumnasActivas * tramo.semanas,
    semanas: tramo.semanas,
    alumnas: alumnasActivas,
    proximaFecha: tramo.proximaFecha,
  }
}
