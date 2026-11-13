// Herramientas que la IA puede usar. La validación (horario, hora libre, una cita por persona) la hace
// el código y la base de datos, no el modelo: aunque la IA se equivoque, no puede crear citas imposibles.
import { db, cwAbrir, cwRenombrar } from './servicios.ts'
import { type Config, diaConCitas, horasDelDia, instante, horaMX, fechaMX, fechaLarga } from './fechas.ts'

export type Contexto = { lead: { id: string; telefono: string; nombre: string | null }; conv: number | null; contacto: number | null; sombra: boolean; prueba?: boolean; config: Config }

const f = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })
const FECHA = { type: 'string', description: 'Fecha YYYY-MM-DD tomada de la lista DÍAS CON CITA' }
const HORA = { type: 'string', description: 'Hora de inicio HH:MM (24 h), una de las que devolvió consultar_horarios' }

export const HERRAMIENTAS = [
  f('consultar_horarios', 'Horas LIBRES para una cita en un día. Llámala siempre antes de ofrecer horas o de agendar/reagendar.', { fecha: FECHA }, ['fecha']),
  f('agendar_cita', 'Agenda una cita NUEVA de informes en el plantel, solo después de que el usuario confirmó día y hora.',
    { fecha: FECHA, hora: HORA, nombre: { type: 'string', description: 'Nombre completo del usuario' },
      modalidad: { type: 'string', enum: ['Auxiliar de Enfermería', 'Auxiliar de Enfermería + Bachillerato'] } }, ['fecha', 'hora', 'nombre', 'modalidad']),
  f('ver_mi_cita', 'Busca la cita vigente del usuario (por su teléfono). Úsala antes de reagendar o cancelar.'),
  f('reagendar_cita', 'Mueve la cita vigente del usuario a otro día u hora libre.', { fecha: FECHA, hora: HORA }, ['fecha', 'hora']),
  f('cancelar_cita', 'Cancela la cita vigente del usuario, solo si él lo pide y lo confirma.'),
  f('registrar_interes_visita', 'Anota que el usuario piensa visitar el plantel sin cita.'),
  f('pasar_con_asesor', 'Pasa la conversación a un asesor (deja de responder la IA). Úsala siempre que vayas a decir que un asesor le atenderá.'),
  f('actualizar_nombre', 'Guarda el nombre real que te dio el usuario. Una sola vez.', { nombre: { type: 'string' } }, ['nombre']),
]

const ACTIVAS = ['agendada', 'confirmada']

async function citaActiva(leadId: string) {
  const { data } = await db.from('citas').select('id, inicio, modalidad, estado').eq('lead_id', leadId)
    .in('estado', ACTIVAS).gte('inicio', new Date().toISOString()).order('inicio').limit(1)
  return data?.[0] ?? null
}

async function horasLibres(c: Config, fecha: string): Promise<string[]> {
  if (!diaConCitas(c, fecha)) return []
  const { data } = await db.from('citas').select('inicio').in('estado', ACTIVAS)
    .gte('inicio', instante(fecha, '00:00').toISOString()).lt('inicio', instante(fecha, '23:59').toISOString())
  const ocupadas = new Set((data ?? []).map((x: { inicio: string }) => horaMX(new Date(x.inicio))))
  const minimo = Date.now() + 60 * 60 * 1000                     // nada con menos de 1 h de anticipación
  return horasDelDia(c, fecha).filter(h => !ocupadas.has(h) && instante(fecha, h).getTime() >= minimo)
}

async function validarHora(c: Config, fecha: string, hora: string): Promise<string | null> {
  if (!diaConCitas(c, fecha)) return `El ${fechaLarga(fecha)} no hay citas.`
  if (!(await horasLibres(c, fecha)).includes(hora)) return `Las ${hora} del ${fechaLarga(fecha)} no está libre.`
  return null
}

const describe = (x: { inicio: string; modalidad: string | null; estado: string }) =>
  ({ fecha: fechaMX(new Date(x.inicio)), dia: fechaLarga(fechaMX(new Date(x.inicio))), hora: horaMX(new Date(x.inicio)), modalidad: x.modalidad, estado: x.estado })

export async function ejecutar(nombre: string, args: Record<string, string>, ctx: Contexto): Promise<unknown> {
  const c = ctx.config, fin = (fecha: string, hora: string) => new Date(instante(fecha, hora).getTime() + c.duracion_cita_min * 60000)
  switch (nombre) {
    case 'consultar_horarios': {
      const libres = await horasLibres(c, args.fecha)
      return diaConCitas(c, args.fecha) ? { fecha: args.fecha, dia: fechaLarga(args.fecha), libres } : { error: 'Ese día no hay citas.' }
    }
    case 'agendar_cita': {
      const ya = await citaActiva(ctx.lead.id)
      if (ya) return { error: 'El usuario ya tiene una cita vigente; si quiere cambiarla usa reagendar_cita.', cita: describe(ya) }
      const mal = await validarHora(c, args.fecha, args.hora)
      if (mal) return { error: mal }
      if (ctx.sombra) return { ok: true, simulado: true, dia: fechaLarga(args.fecha), hora: args.hora }
      const { error } = await db.from('citas').insert({ lead_id: ctx.lead.id, inicio: instante(args.fecha, args.hora).toISOString(),
        fin: fin(args.fecha, args.hora).toISOString(), modalidad: args.modalidad, origen: 'agente' })
      if (error) return { error: error.code === '23505' ? 'Esa hora se acaba de ocupar; ofrece otra.' : 'Fallo técnico al agendar.' }
      await db.from('leads').update({ estado: 'cita', nombre: args.nombre || ctx.lead.nombre }).eq('id', ctx.lead.id)
      return { ok: true, dia: fechaLarga(args.fecha), hora: args.hora }
    }
    case 'ver_mi_cita': {
      const ya = await citaActiva(ctx.lead.id)
      return ya ? { cita: describe(ya) } : { cita: null, nota: 'No tiene cita vigente.' }
    }
    case 'reagendar_cita': {
      const ya = await citaActiva(ctx.lead.id)
      if (!ya) return { error: 'No tiene cita vigente para reagendar.' }
      const mal = await validarHora(c, args.fecha, args.hora)
      if (mal) return { error: mal }
      if (ctx.sombra) return { ok: true, simulado: true, dia: fechaLarga(args.fecha), hora: args.hora }
      const antes = describe(ya)
      const { error } = await db.from('citas').update({ inicio: instante(args.fecha, args.hora).toISOString(), fin: fin(args.fecha, args.hora).toISOString(),
        estado: 'agendada', confirmada_at: null, recordatorio_24h_at: null, aviso_sin_confirmar_at: null,
        notas: `Reagendada por el agente (antes: ${antes.dia} ${antes.hora})` }).eq('id', ya.id)
      if (error) return { error: error.code === '23505' ? 'Esa hora se acaba de ocupar; ofrece otra.' : 'Fallo técnico al reagendar.' }
      return { ok: true, dia: fechaLarga(args.fecha), hora: args.hora }
    }
    case 'cancelar_cita': {
      const ya = await citaActiva(ctx.lead.id)
      if (!ya) return { error: 'No tiene cita vigente.' }
      if (!ctx.sombra) await db.from('citas').update({ estado: 'cancelada', notas: 'Cancelada por el usuario (agente)' }).eq('id', ya.id)
      return { ok: true }
    }
    case 'registrar_interes_visita':
      if (!ctx.sombra) await db.from('leads').update({ interes_visita_at: new Date().toISOString() }).eq('id', ctx.lead.id)
      return { ok: true }
    case 'pasar_con_asesor':
      if (!ctx.sombra && !ctx.prueba && ctx.conv) await cwAbrir(ctx.conv)
      return { ok: true }
    case 'actualizar_nombre':
      if (!ctx.sombra) {
        await db.from('leads').update({ nombre: args.nombre }).eq('id', ctx.lead.id)
        if (ctx.contacto && !ctx.prueba) await cwRenombrar(ctx.contacto, args.nombre).catch(() => null)
      }
      ctx.lead.nombre = args.nombre
      return { ok: true }
    default:
      return { error: `Herramienta desconocida: ${nombre}` }
  }
}
