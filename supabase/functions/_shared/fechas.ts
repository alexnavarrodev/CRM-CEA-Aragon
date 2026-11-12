// Fechas en hora de Ciudad de México. CDMX no tiene horario de verano desde 2022: siempre UTC-6.
export const OFFSET = '-06:00'
const MS_OFFSET = 6 * 3600 * 1000

export type Config = {
  grupo_principal: { nombre: string; horario: string; inicio: string | null }
  grupo_alternativo?: { nombre: string; horario: string; inicio: string | null } | null
  promocion?: { activa: boolean; nombre: string; texto: string; fin: string | null } | null
  precios: { inscripcion: number; colegiatura_auxiliar: number; colegiatura_auxiliar_bachillerato: number;
    uniformes: number; certificado: number; curso_rcp: number; curso_heridas: number }
  horario_citas: Record<string, [string, string]>   // clave = día sin acentos: martes, miercoles, sabado…
  duracion_cita_min: number
  tolerancia_min: number
  dias_bloqueados: string[]                          // YYYY-MM-DD
}

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIAS_TXT = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Reloj" de CDMX: un Date cuyos campos UTC son la hora local de CDMX. */
export const ahoraMX = () => new Date(Date.now() - MS_OFFSET)
export const hoyISO = () => ahoraMX().toISOString().slice(0, 10)

const deISO = (f: string) => new Date(f + 'T12:00:00Z')            // mediodía, para no saltar de día
export const diaSemana = (f: string) => DIAS[deISO(f).getUTCDay()]
export function fechaLarga(f: string): string {
  const d = deISO(f)
  return `${DIAS_TXT[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

export function hoyTexto(): string {
  const d = ahoraMX()
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${fechaLarga(d.toISOString().slice(0, 10))} de ${d.getUTCFullYear()}, ${hh}:${mm}`
}

/** Instante real (UTC) de una fecha y hora de CDMX. */
export const instante = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00${OFFSET}`)

/** "14:30" de un instante, en hora de CDMX. */
export function horaMX(d: Date): string {
  const l = new Date(d.getTime() - MS_OFFSET)
  return `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}
export const fechaMX = (d: Date) => new Date(d.getTime() - MS_OFFSET).toISOString().slice(0, 10)

export function diaConCitas(c: Config, fecha: string): boolean {
  return !!c.horario_citas[diaSemana(fecha)] && !c.dias_bloqueados.includes(fecha)
}

export function diasValidos(c: Config, n: number): { fecha: string; texto: string }[] {
  const out = []
  const base = deISO(hoyISO())
  for (let i = 0; i < n; i++) {
    const f = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10)
    if (diaConCitas(c, f)) out.push({ fecha: f, texto: (i === 0 ? 'hoy ' : i === 1 ? 'mañana ' : '') + fechaLarga(f) })
  }
  return out
}

/** Horas de inicio posibles de un día según el horario de citas (sin mirar ocupación). */
export function horasDelDia(c: Config, fecha: string): string[] {
  const r = c.horario_citas[diaSemana(fecha)]
  if (!r) return []
  const [a, b] = r.map(h => { const [x, y] = h.split(':').map(Number); return x * 60 + y })
  const out = []
  for (let m = a; m + c.duracion_cita_min <= b; m += c.duracion_cita_min)
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  return out
}
