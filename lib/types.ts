export type AlumnaStatus = 'activa' | 'egresada' | 'baja'
export type AlumnaPrograma = 'colegiaturas' | 'bachillerato' | 'ambos'
export type PagoEstado = 'pagado' | 'parcial' | 'pendiente'
export type ProspectoStatus = 'nuevo' | 'contactado' | 'interesado' | 'inscrito' | 'no_interesado'
export type MovimientoTipo = 'ingreso' | 'egreso'
export type Canal = 'efectivo' | 'transferencia' | 'tarjeta'

export const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'] as const
export const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export const DIA_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  LUN: { bg: '#6366F1', text: '#fff', label: 'LUN' },
  MAR: { bg: '#3B82F6', text: '#fff', label: 'MAR' },
  MIE: { bg: '#06B6D4', text: '#fff', label: 'MIE' },
  JUE: { bg: '#D97706', text: '#fff', label: 'JUE' },
  VIE: { bg: '#10B981', text: '#fff', label: 'VIE' },
  SAB: { bg: '#8B5CF6', text: '#fff', label: 'SAB' },
  DOM: { bg: '#EC4899', text: '#fff', label: 'DOM' },
}

export interface Grupo {
  id: string
  user_id: string
  nombre: string
  dia: string
  horario: string | null
  color: string
  maestra: string | null
  created_at: string
}

export interface Alumna {
  id: string
  user_id: string
  nombre: string
  telefono: string | null
  email: string | null
  grupo_id: string | null
  cuota_mensual: number
  fecha_inscripcion: string | null
  promedio: number
  asistencia_pct: number
  status: AlumnaStatus
  programa: AlumnaPrograma
  notas: string | null
  created_at: string
  updated_at: string
  grupo?: Grupo
}

export interface PagoColegiatura {
  id: string
  user_id: string
  alumna_id: string
  anio: number
  mes: number
  monto: number
  estado: PagoEstado
  fecha_pago: string | null
  notas: string | null
  created_at: string
}

export interface PagoBachillerato {
  id: string
  user_id: string
  alumna_id: string
  anio: number
  tipo: string // inscripcion | materiales | ene | feb | ... | dic
  monto: number
  estado: 'pagado' | 'parcial' | 'pendiente'
  fecha_pago: string | null
  created_at: string
}

export interface MovimientoCaja {
  id: string
  user_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  canal: Canal
  categoria: string
  fecha: string
  alumna_id: string | null
  created_at: string
  alumna?: Alumna
}

export interface Prospecto {
  id: string
  user_id: string
  nombre: string
  telefono: string | null
  email: string | null
  interes: string
  status: ProspectoStatus
  notas: string | null
  fecha_contacto: string
  created_at: string
  updated_at: string
}

export const PROSPECTO_ESTADOS: Record<ProspectoStatus, { label: string; color: string; bg: string }> = {
  nuevo:         { label: 'Nuevo',        color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  contactado:    { label: 'Contactado',   color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  interesado:    { label: 'Interesado',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  inscrito:      { label: 'Inscrito',     color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200' },
  no_interesado: { label: 'No interesado',color: 'text-slate-500',  bg: 'bg-slate-100 border-slate-200' },
}

export const CANAL_LABELS: Record<string, string> = {
  inscripcion:  'Inscripción',
  colegiatura:  'Colegiatura',
  bachillerato: 'Bachillerato',
  materiales:   'Materiales',
  otros:        'Otros',
}
