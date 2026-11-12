// Prueba local sin claves: fechas, horas de cita e instrucciones generadas con la configuración real.
import { construirPrompt, promoVigente } from '../_shared/prompt.ts'
import { diasValidos, horasDelDia, instante, horaMX, fechaMX, hoyTexto, type Config } from '../_shared/fechas.ts'
const c: Config = JSON.parse(Deno.readTextFileSync(new URL('./config.json', import.meta.url)))
console.log('HOY:', hoyTexto(), '| promo vigente:', promoVigente(c))
console.log('Días con cita:', diasValidos(c, 14).map(d => d.texto).join(' | '))
console.log('Horas sábado:', horasDelDia(c, '2026-11-14').join(' '))
console.log('Horas martes:', horasDelDia(c, '2026-11-17').join(' '))
const i = instante('2026-11-14', '09:30'); console.log('instante 14 nov 09:30 →', i.toISOString(), '→ vuelta', fechaMX(i), horaMX(i))
const p = construirPrompt(c, 'Laura')
console.log('Largo del prompt:', p.length)
for (const s of ['GRUPOS', 'PROMOCIÓN BUEN FIN', 'Horario de citas', 'DÍAS CON CITA']) { const k = p.indexOf(s); console.log('---', s, '\n' + p.slice(k, k + 330)) }
