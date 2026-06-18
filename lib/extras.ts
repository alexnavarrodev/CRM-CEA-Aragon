// lib/extras.ts — Pagos extra (Uniforme y Certificado). Lógica pura, sin React.

export const UNIFORME_TARGET = 1500
export const CERTIFICADO_TARGET = 7000
export const UNIFORME_MESES_LIMITE = 2   // pagar en los primeros 2 meses
export const CERTIFICADO_MES_LIMITE = 8  // liquidado para el mes 8

export const EXTRA_TARGET: Record<string, number> = {
  uniforme: UNIFORME_TARGET,
  certificado: CERTIFICADO_TARGET,
}
export const EXTRA_LABEL: Record<string, string> = {
  uniforme: 'Uniforme',
  certificado: 'Certificado',
}

export interface PagoExtra { concepto: string; monto: number; estado: string }

/** Meses transcurridos desde el inicio (mes de inicio = 0). */
export function mesesTranscurridos(startAnio: number, startMes: number, hoyAnio: number, hoyMes: number): number {
  return (hoyAnio * 12 + hoyMes) - (startAnio * 12 + startMes)
}

export interface ExtraEstado {
  concepto: string
  pagado: number
  target: number
  falta: number
  completo: boolean
  vencido: boolean      // pasó el plazo y no está completo
  porVencer: boolean    // cerca del plazo (solo certificado), aviso ámbar
}

/** Calcula el estatus de un concepto extra para una alumna.
 *  `elapsed` = meses transcurridos desde el inicio de su curso (o null si no se sabe). */
export function estadoExtra(concepto: string, pagado: number, elapsed: number | null): ExtraEstado {
  const target = EXTRA_TARGET[concepto] ?? 0
  const falta = Math.max(0, target - pagado)
  const completo = pagado >= target
  let vencido = false, porVencer = false
  if (!completo && elapsed != null) {
    if (concepto === 'uniforme') {
      vencido = elapsed >= UNIFORME_MESES_LIMITE
    } else if (concepto === 'certificado') {
      vencido = elapsed >= CERTIFICADO_MES_LIMITE
      porVencer = !vencido && elapsed >= CERTIFICADO_MES_LIMITE - 2 // mes 6-7
    }
  }
  return { concepto, pagado, target, falta, completo, vencido, porVencer }
}
