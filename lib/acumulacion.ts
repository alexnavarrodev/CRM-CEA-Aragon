// ============================================================================
// lib/acumulacion.ts — Lógica PURA de acumulación de pagos
// Sin React, sin Supabase. Solo cálculo. Usable desde cliente Y servidor
// (caja/page.tsx y el futuro webhook de pasarela comparten esto).
//
// Reglas que encapsula:
//  - Límite por mes ($1000 colegiatura para 'ambos' / cuota real para colegiatura
//    pura; $1000 bachillerato).
//  - El pago se aplica al MES MÁS ANTIGUO sin pagar completo y rebosa hacia adelante.
//  - El saldo ya pagado de un mes se mide por ESTADO ('pagado'=lleno, 'parcial'=su
//    monto, 'pendiente'=0 aunque tenga monto placeholder).
//  - Los meses 'pagado' (incluidos los $0 anteriores al inicio de grupo) se saltan,
//    así el barrido arranca en el primer mes real pendiente.
//  - Rango Nov 2025 → Dic 2027 (mismo que las cuadrículas).
// ============================================================================

export const TIPOS_BACHI = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as const

/** Número de mes (1-12) → tipo de bachillerato ('ene'..'dic'). */
export function mesToBachiTipo(mes: number): string {
  return TIPOS_BACHI[mes - 1]
}

export interface ColMonth   { anio: number; mes: number;  key: string }
export interface BachiMonth { anio: number; tipo: string; key: string }

/** Secuencia cronológica de colegiatura: Nov 2025 → Dic 2027. */
export function colMonthSequence(): ColMonth[] {
  const seq: ColMonth[] = []
  for (let anio = 2025; anio <= 2027; anio++) {
    const start = anio === 2025 ? 11 : 1
    for (let m = start; m <= 12; m++) seq.push({ anio, mes: m, key: `${anio}-${m}` })
  }
  return seq
}

/** Secuencia cronológica de bachillerato: Nov 2025 → Dic 2027. */
export function bachiMonthSequence(): BachiMonth[] {
  const seq: BachiMonth[] = []
  for (let anio = 2025; anio <= 2027; anio++) {
    const start = anio === 2025 ? 10 : 0 // índice 10 = 'nov'
    for (let i = start; i < 12; i++) {
      const tipo = TIPOS_BACHI[i]
      seq.push({ anio, tipo, key: `${anio}-${tipo}` })
    }
  }
  return seq
}

/** Saldo YA pagado de un registro según su estado (no su monto crudo). */
export function saldoPagado(estado: string, monto: number, limit: number): number {
  if (estado === 'pagado') return limit
  if (estado === 'parcial') return Number(monto) || 0
  return 0 // 'pendiente' u otro → no cuenta como pagado
}

export interface PagoExistente {
  id: string
  anio: number
  mes?: number   // colegiatura
  tipo?: string  // bachillerato
  monto: number
  estado: string
}

export interface PlanWriteCol   { id?: string; anio: number; mes: number;  monto: number; estado: 'pagado' | 'parcial' }
export interface PlanWriteBachi { id?: string; anio: number; tipo: string; monto: number; estado: 'pagado' | 'parcial' }

// ── Núcleo genérico ──────────────────────────────────────────────────────────
function computePlan<T extends { key: string }>(
  seq: T[],
  byKey: Record<string, { id: string; paid: number }>,
  monto: number,
  startKey: string,
  limit: number,
): Array<{ item: T; id?: string; monto: number; estado: 'pagado' | 'parcial' }> {
  if (monto <= 0 || limit <= 0) return []

  // Mes seleccionado (origen del modal / del pago)
  const selIdx = Math.max(0, seq.findIndex(s => s.key === startKey))

  // Primer mes con algún registro de la alumna
  let firstRecordIdx = seq.length
  seq.forEach((s, i) => { if (byKey[s.key] && i < firstRecordIdx) firstRecordIdx = i })

  const hasRecords = Object.keys(byKey).length > 0
  const lowerBound = hasRecords ? Math.min(firstRecordIdx, selIdx) : selIdx

  // Avanzar hasta el primer mes que NO esté pagado completo (el más antiguo pendiente)
  let startIdx = lowerBound
  while (startIdx < seq.length && (byKey[seq[startIdx].key]?.paid ?? 0) >= limit) startIdx++

  const out: Array<{ item: T; id?: string; monto: number; estado: 'pagado' | 'parcial' }> = []
  let remaining = monto
  for (let i = startIdx; i < seq.length && remaining > 0; i++) {
    const cur = byKey[seq[i].key]?.paid ?? 0
    if (cur >= limit) continue // saltar meses ya llenos
    const add = Math.min(limit - cur, remaining)
    const newBal = cur + add
    remaining -= add
    out.push({
      item: seq[i],
      id: byKey[seq[i].key]?.id,
      monto: newBal,
      estado: newBal >= limit ? 'pagado' : 'parcial',
    })
  }
  return out
}

/**
 * Plan de escritura para un pago de COLEGIATURA.
 * Devuelve la lista de meses a crear/actualizar (con id si ya existían).
 */
export function planColegiatura(
  existing: PagoExistente[],
  monto: number,
  startAnio: number,
  startMes: number,
  limit: number,
): PlanWriteCol[] {
  const seq = colMonthSequence()
  const byKey: Record<string, { id: string; paid: number }> = {}
  for (const p of existing) {
    if (p.mes == null) continue
    byKey[`${p.anio}-${p.mes}`] = { id: p.id, paid: saldoPagado(p.estado, p.monto, limit) }
  }
  return computePlan(seq, byKey, monto, `${startAnio}-${startMes}`, limit)
    .map(w => ({ id: w.id, anio: w.item.anio, mes: w.item.mes, monto: w.monto, estado: w.estado }))
}

/**
 * Plan de escritura para un pago de BACHILLERATO.
 */
export function planBachillerato(
  existing: PagoExistente[],
  monto: number,
  startAnio: number,
  startTipo: string,
  limit: number,
): PlanWriteBachi[] {
  const seq = bachiMonthSequence()
  const byKey: Record<string, { id: string; paid: number }> = {}
  for (const p of existing) {
    if (!p.tipo) continue
    byKey[`${p.anio}-${p.tipo}`] = { id: p.id, paid: saldoPagado(p.estado, p.monto, limit) }
  }
  return computePlan(seq, byKey, monto, `${startAnio}-${startTipo}`, limit)
    .map(w => ({ id: w.id, anio: w.item.anio, tipo: w.item.tipo, monto: w.monto, estado: w.estado }))
}

// ── Cálculo de ADEUDO (meses pendientes hasta una fecha de corte) ────────────
// Usado por la página pública /pagar/[token] y la cobranza. Puro.

export interface MesAdeudado { anio: number; mes?: number; tipo?: string; falta: number }

/** Mes de arranque del curso de una alumna (normalmente el de su grupo:
 *  `grupos.anio_inicio` / `grupos.mes_inicio`). */
export interface InicioCurso { anio: number; mes: number }

/**
 * Mes desde el que se le puede exigir pago a una alumna: el MÁS TARDÍO entre el inicio
 * de su grupo y el mes en que se dio de alta.
 *
 * ⚠️ No basta con el inicio del grupo: muchas alumnas entran con el curso ya empezado
 * (Sandra Vera entró en ago 2026 a MMLC, que arrancó en feb) y cobrarles desde el
 * arranque del grupo inventaría meses de deuda de antes de que existieran. Y no basta
 * con su primer registro de pago, porque una alumna recién inscrita aún no tiene
 * ninguno y saldría como "al corriente" debiendo (Daniela Bazán y María Guadalupe
 * Rodríguez de SMA, 28 ago 2026).
 *
 * `created_at` viene en UTC; se pasa a hora de México antes de tomar el mes, para que
 * un alta de madrugada no se cuente en el mes siguiente.
 */
export function inicioCobro(
  grupoInicio: InicioCurso | null | undefined,
  alumnaCreatedAt: string | null | undefined,
): InicioCurso | null {
  let alta: InicioCurso | null = null
  if (alumnaCreatedAt) {
    const t = Date.parse(alumnaCreatedAt)
    if (!Number.isNaN(t)) {
      const mx = new Date(t - 6 * 3600 * 1000)
      alta = { anio: mx.getUTCFullYear(), mes: mx.getUTCMonth() + 1 }
    }
  }
  if (!grupoInicio) return alta
  if (!alta) return grupoInicio
  return (alta.anio * 12 + alta.mes) > (grupoInicio.anio * 12 + grupoInicio.mes) ? alta : grupoInicio
}

/** Índice del mes desde el que se le puede exigir pago a la alumna.
 *  Es el MÁS ANTIGUO entre el inicio de su grupo y su registro de pago más viejo.
 *
 *  ⚠️ El inicio del grupo es imprescindible: sin él, una alumna que todavía no tiene
 *  NINGÚN registro de pago daba lista vacía y aparecía como "al corriente" aunque
 *  debiera todo (pasó con Daniela Bazán y María Guadalupe Rodríguez de SMA, 28 ago 2026).
 *  Antes lo tapaban las filas placeholder de $0; al eliminarlas quedó al descubierto. */
function indiceInicio<T extends { key: string }>(
  seq: T[], byKey: Record<string, number>,
  coincideInicio: (s: T) => boolean, inicio?: InicioCurso | null,
): number {
  let firstIdx = seq.length
  seq.forEach((s, i) => { if (byKey[s.key] !== undefined && i < firstIdx) firstIdx = i })
  if (inicio) {
    const iIdx = seq.findIndex(coincideInicio)
    if (iIdx >= 0 && iIdx < firstIdx) firstIdx = iIdx
  }
  return firstIdx
}

/** Meses de colegiatura con saldo pendiente, desde el inicio del curso (o el primer
 *  registro de la alumna, lo que sea más antiguo) hasta el mes de corte inclusive.
 *  Los meses 'pagado' no cuentan. */
export function mesesAdeudadosCol(
  existing: PagoExistente[], limit: number, hastaAnio: number, hastaMes: number,
  inicio?: InicioCurso | null,
): MesAdeudado[] {
  const seq = colMonthSequence()
  const byKey: Record<string, number> = {}
  for (const p of existing) { if (p.mes != null) byKey[`${p.anio}-${p.mes}`] = saldoPagado(p.estado, p.monto, limit) }
  const firstIdx = indiceInicio(seq, byKey,
    s => !!inicio && s.anio === inicio.anio && s.mes === inicio.mes, inicio)
  if (firstIdx >= seq.length) return []
  let cutoff = seq.findIndex(s => s.anio === hastaAnio && s.mes === hastaMes)
  if (cutoff < 0) cutoff = seq.length - 1
  const out: MesAdeudado[] = []
  for (let i = firstIdx; i <= cutoff; i++) {
    const paid = byKey[seq[i].key] ?? 0
    if (paid < limit) out.push({ anio: seq[i].anio, mes: seq[i].mes, falta: limit - paid })
  }
  return out
}

/** Igual pero para bachillerato (límite 1000, corte por tipo de mes). */
export function mesesAdeudadosBachi(
  existing: PagoExistente[], limit: number, hastaAnio: number, hastaTipo: string,
  inicio?: InicioCurso | null,
): MesAdeudado[] {
  const seq = bachiMonthSequence()
  const byKey: Record<string, number> = {}
  for (const p of existing) { if (p.tipo) byKey[`${p.anio}-${p.tipo}`] = saldoPagado(p.estado, p.monto, limit) }
  const tipoInicio = inicio ? TIPOS_BACHI[inicio.mes - 1] : null
  const firstIdx = indiceInicio(seq, byKey,
    s => !!inicio && s.anio === inicio.anio && s.tipo === tipoInicio, inicio)
  if (firstIdx >= seq.length) return []
  let cutoff = seq.findIndex(s => s.anio === hastaAnio && s.tipo === hastaTipo)
  if (cutoff < 0) cutoff = seq.length - 1
  const out: MesAdeudado[] = []
  for (let i = firstIdx; i <= cutoff; i++) {
    const paid = byKey[seq[i].key] ?? 0
    if (paid < limit) out.push({ anio: seq[i].anio, tipo: seq[i].tipo, falta: limit - paid })
  }
  return out
}

// ── Descuento por PRONTO PAGO ────────────────────────────────────────────────
// Si paga antes del día límite, su colegiatura del mes actual baja $50 y ese mes
// queda 'pagado' (no parcial). El $50 es un descuento, no afecta el estado.
export const PRONTO_PAGO_MONTO = 50
export const PRONTO_PAGO_DIA_LIMITE = 20

/** ¿Aplica descuento de pronto pago al mes actual de colegiatura?
 *  Requiere: programa 'colegiaturas', hoy ≤ día límite, y que el mes actual esté
 *  COMPLETAMENTE sin pagar (entre los adeudados con falta == límite). */
export function aplicaDescuentoProntoPago(
  programa: string, hoyDia: number, adeudoCol: MesAdeudado[],
  hoyAnio: number, hoyMes: number, limit: number,
): boolean {
  // Aplica a colegiatura pura y a 'ambos' (solo sobre la parte de colegiatura)
  if (programa !== 'colegiaturas' && programa !== 'ambos') return false
  if (hoyDia > PRONTO_PAGO_DIA_LIMITE) return false
  const cur = adeudoCol.find(m => m.anio === hoyAnio && m.mes === hoyMes)
  return !!cur && cur.falta >= limit
}
