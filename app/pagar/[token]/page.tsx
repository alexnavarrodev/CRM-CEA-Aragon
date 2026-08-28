// Página pública de pago por alumna — SIN login.
// Lee la alumna por su token (server-side con service_role) y muestra su adeudo
// SEPARADO en Mensualidad, Uniforme y Certificado, cada uno con su botón de pago.

import { createClient } from '@supabase/supabase-js'
import { MESES_FULL } from '@/lib/types'
import {
  mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, TIPOS_BACHI, inicioCobro,
  type MesAdeudado,
} from '@/lib/acumulacion'
import {
  EXTRA_TARGET, estadoExtra, mesesTranscurridos,
} from '@/lib/extras'
import type { PaymentCalendar } from '@/lib/nomina'
import {
  recargosColegiatura, totalRecargo, proximaFechaPago, setDeExenciones, RECARGO_DIAS_GRACIA,
} from '@/lib/recargos'
import BotonPagar from './BotonPagar'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const mesLabelCol = (m: MesAdeudado) => `${MESES_FULL[(m.mes ?? 1) - 1]} ${m.anio}`

/** 'YYYY-MM-DD' → "viernes 18 de septiembre". UTC para no correr el día en UTC−6. */
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-MX', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`))
const mesLabelBachi = (m: MesAdeudado) => {
  const idx = TIPOS_BACHI.indexOf((m.tipo ?? 'ene') as typeof TIPOS_BACHI[number])
  return `${MESES_FULL[idx]} ${m.anio} (bach.)`
}
export default async function PagarPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ pago?: string }>
}) {
  const { token } = await params
  const { pago } = await searchParams

  const now = new Date(Date.now() - 6 * 3600 * 1000)
  const hoyAnio = now.getUTCFullYear()
  const hoyMes = now.getUTCMonth() + 1
  const hoyDia = now.getUTCDate()

  const supabase = adminClient()

  const { data: alumna } = await supabase
    .from('alumnas').select('id, user_id, nombre, cuota_mensual, programa, status, grupo_id, created_at')
    .eq('pago_token', token).maybeSingle()

  if (!alumna) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-xl font-bold text-white mb-1">Enlace no válido</h1>
          <p className="text-white/50 text-sm">Pide a la escuela tu enlace de pago actualizado.</p>
        </div>
      </Shell>
    )
  }

  const esCol   = alumna.programa === 'colegiaturas' || alumna.programa === 'ambos'
  const esBachi = alumna.programa === 'bachillerato' || alumna.programa === 'ambos'
  const colLimit = alumna.programa === 'ambos' ? 1000 : (Number(alumna.cuota_mensual) || 1000)

  let colRows: { anio: number; mes: number; monto: number; estado: string; id: string }[] = []
  let bachiRows: { anio: number; tipo: string; monto: number; estado: string; id: string }[] = []
  if (esCol) {
    const { data } = await supabase.from('pagos_colegiaturas').select('id, anio, mes, monto, estado').eq('alumna_id', alumna.id)
    colRows = data ?? []
  }
  if (esBachi) {
    const { data } = await supabase.from('pagos_bachillerato').select('id, anio, tipo, monto, estado').eq('alumna_id', alumna.id)
    bachiRows = data ?? []
  }
  const { data: exrows } = await supabase.from('pagos_extras').select('concepto, monto').eq('alumna_id', alumna.id)

  // Desde cuándo se le puede cobrar. Imprescindible: sin esto, una alumna que aún no
  // tiene ningún registro de pago vería "no debes nada" en su enlace público.
  let inicioGrupoRaw: { anio: number; mes: number } | null = null
  let calendario: PaymentCalendar | null = null
  if (alumna.grupo_id) {
    const { data: g } = await supabase.from('grupos')
      .select('anio_inicio, mes_inicio, calendario_id').eq('id', alumna.grupo_id).maybeSingle()
    if (g?.anio_inicio && g?.mes_inicio) inicioGrupoRaw = { anio: g.anio_inicio, mes: g.mes_inicio }
    // Calendario de pagos de su grupo: de ahí salen su fecha de pago y el recargo.
    if (g?.calendario_id) {
      const { data: kv } = await supabase.from('app_kv')
        .select('value').eq('user_id', alumna.user_id).eq('key', 'payment_calendars_v2').maybeSingle()
      const cals = Array.isArray(kv?.value) ? (kv!.value as PaymentCalendar[]) : []
      calendario = cals.find(c => c.id === g.calendario_id) ?? null
    }
  }
  const inicioGrupo = inicioCobro(inicioGrupoRaw, alumna.created_at)

  // ── Mensualidad ──
  // ⚠️ Cada cálculo SOLO si la alumna está en ese programa. `mesesAdeudados*` arranca en el
  // inicio del curso aunque no haya ningún registro, así que llamarlo para un programa que
  // la alumna no cursa le inventa deuda (a Jacqueline Ocaña, sólo colegiaturas, le salieron
  // $4,000 de bachillerato fantasma en su enlace público, 28 ago 2026).
  const adeudoCol = esCol
    ? mesesAdeudadosCol(colRows, colLimit, hoyAnio, hoyMes, inicioGrupo) : []
  const adeudoBachi = esBachi
    ? mesesAdeudadosBachi(bachiRows, 1000, hoyAnio, mesToBachiTipo(hoyMes), inicioGrupo) : []
  const mensBruto = adeudoCol.reduce((s, m) => s + m.falta, 0) + adeudoBachi.reduce((s, m) => s + m.falta, 0)

  // ── Recargo por pago tardío (10% por cada mes de colegiatura con +2 semanas) ──
  const hoyISO = new Date(Date.UTC(hoyAnio, hoyMes - 1, hoyDia)).toISOString().slice(0, 10)
  const { data: exFilas } = await supabase.from('recargo_exenciones')
    .select('anio, mes').eq('alumna_id', alumna.id)
  const exentos = setDeExenciones(exFilas)
  const recargos = recargosColegiatura(calendario, adeudoCol, hoyISO, exentos)
  const recargoTotal = totalRecargo(recargos)
  const hayExencion = recargos.some(r => r.exento)
  const mensTotal = mensBruto + recargoTotal
  const proximoPago = proximaFechaPago(calendario, hoyISO)

  // ── Inicio de curso (registro más antiguo, o el del grupo) → vencimientos ──
  let start: { anio: number; mes: number } | null = inicioGrupo
  for (const p of colRows) if (!start || (p.anio * 12 + p.mes) < (start.anio * 12 + start.mes)) start = { anio: p.anio, mes: p.mes }
  for (const p of bachiRows) {
    const mm = TIPOS_BACHI.indexOf(p.tipo as typeof TIPOS_BACHI[number]) + 1
    if (mm > 0 && (!start || (p.anio * 12 + mm) < (start.anio * 12 + start.mes))) start = { anio: p.anio, mes: mm }
  }
  const elapsed = start ? mesesTranscurridos(start.anio, start.mes, hoyAnio, hoyMes) : null

  // ── Uniforme y Certificado ──
  const uniPaid = Number(exrows?.find(p => p.concepto === 'uniforme')?.monto ?? 0)
  const certPaid = Number(exrows?.find(p => p.concepto === 'certificado')?.monto ?? 0)
  const stUni = estadoExtra('uniforme', uniPaid, elapsed)
  const stCert = estadoExtra('certificado', certPaid, elapsed)

  const todoAlCorriente = mensTotal <= 0 && stUni.completo && stCert.completo

  return (
    <Shell>
      <div className="text-center mb-6">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Estado de cuenta</p>
        <h1 className="text-2xl font-bold text-white">{alumna.nombre}</h1>
        {proximoPago && (
          <p className="text-white/50 text-sm mt-2">
            Tu próxima fecha de pago:{' '}
            <span className="text-white font-medium capitalize">{fechaLarga(proximoPago)}</span>
          </p>
        )}
      </div>

      {pago === 'ok' && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 mb-4 text-center">
          <p className="text-emerald-300 text-sm font-medium">¡Pago recibido! 🎉</p>
          <p className="text-white/50 text-xs mt-0.5">Puede tardar 1-2 minutos en reflejarse aquí.</p>
        </div>
      )}
      {pago === 'pend' && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 mb-4 text-center">
          <p className="text-amber-300 text-sm font-medium">Pago en proceso</p>
          <p className="text-white/50 text-xs mt-0.5">Si pagaste por transferencia, puede tardar unos minutos.</p>
        </div>
      )}

      {todoAlCorriente ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 p-8 text-center">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-emerald-300 font-semibold text-lg">Estás al corriente</p>
          <p className="text-white/50 text-sm mt-1">No tienes pagos pendientes. ¡Gracias!</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── MENSUALIDAD ── */}
          {mensTotal > 0 ? (
            <section className="rounded-2xl bg-white/8 border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Mensualidad</span>
                <span className="text-white font-bold">{fmt(mensTotal)}</span>
              </div>
              <ul className="px-4 py-1">
                {adeudoCol.map((m, i) => {
                  const r = recargos.find(x => x.anio === m.anio && x.mes === m.mes)
                  return (
                    <li key={'c' + i} className="py-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white/70">{mesLabelCol(m)}</span>
                        <span className="text-white/80 tabular-nums">{fmt(m.falta)}</span>
                      </div>
                      {r?.fechaLimite && (
                        <p className={`text-xs mt-0.5 ${r.recargo > 0 ? 'text-red-300' : 'text-white/35'}`}>
                          Fecha de pago: {fechaLarga(r.fechaLimite)}
                          {r.diasTarde > 0 && ` · ${r.diasTarde} ${r.diasTarde === 1 ? 'día' : 'días'} de retraso`}
                        </p>
                      )}
                      {r && r.recargo > 0 && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-red-300 text-xs">⚠️ Recargo 10% por pago tardío</span>
                          <span className="text-red-300 text-xs tabular-nums">+{fmt(r.recargo)}</span>
                        </div>
                      )}
                      {r?.exento && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-emerald-300 text-xs">✓ Sin recargo por esta ocasión</span>
                          <span className="text-emerald-300 text-xs tabular-nums">+$0</span>
                        </div>
                      )}
                    </li>
                  )
                })}
                {adeudoBachi.map((m, i) => (
                  <li key={'b' + i} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-white/70">{mesLabelBachi(m)}</span>
                    <span className="text-white/80 tabular-nums">{fmt(m.falta)}</span>
                  </li>
                ))}
              </ul>
              {recargoTotal > 0 && (
                <p className="px-4 pb-1 text-red-300/80 text-xs">
                  Incluye {fmt(recargoTotal)} de recargo por pago tardío.
                </p>
              )}
              {hayExencion && (
                <p className="px-4 pb-1 text-emerald-300/90 text-xs">
                  🎁 Esta vez no se te aplica recargo, aunque ya pasó la fecha.
                </p>
              )}
              {/* Aviso permanente: que nadie pueda decir que no se le informó. */}
              <p className="px-4 pb-2 text-white/40 text-xs">
                A partir de la próxima colegiatura, si pasan más de {RECARGO_DIAS_GRACIA} días
                de tu fecha de pago se aplica un recargo del 10%.
              </p>
              <div className="p-3 pt-1">
                <BotonPagar token={token} concepto="mensualidad" label={`💳 Pagar mensualidad · ${fmt(mensTotal)}`} />
              </div>
            </section>
          ) : (
            <section className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Mensualidad</span>
              <span className="text-emerald-300 text-sm font-medium">Al corriente ✓</span>
            </section>
          )}

          {/* ── UNIFORME ── */}
          <ConceptoCard
            titulo="Uniforme" token={token} concepto="uniforme"
            falta={stUni.falta} target={EXTRA_TARGET.uniforme} completo={stUni.completo}
            vencido={stUni.vencido}
          />

          {/* ── CERTIFICADO ── */}
          <ConceptoCard
            titulo="Certificado" token={token} concepto="certificado"
            falta={stCert.falta} target={EXTRA_TARGET.certificado} completo={stCert.completo}
            vencido={stCert.vencido}
          />
        </div>
      )}
    </Shell>
  )
}

// ── Tarjeta de concepto extra (uniforme / certificado) ───────────────────────
function ConceptoCard({ titulo, token, concepto, falta, target, completo, vencido }: {
  titulo: string; token: string; concepto: 'uniforme' | 'certificado'
  falta: number; target: number; completo: boolean; vencido: boolean
}) {
  const pagado = target - falta
  const pct = Math.min(100, Math.round((pagado / target) * 100))
  if (completo) {
    return (
      <section className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{titulo}</span>
        <span className="text-emerald-300 text-sm font-medium">Liquidado ✓</span>
      </section>
    )
  }
  return (
    <section className="rounded-2xl bg-white/8 border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{titulo}</span>
        <span className="text-white font-bold">{fmt(falta)}</span>
      </div>
      <div className="px-4 pt-3">
        <div className="flex justify-between text-[11px] text-white/40 mb-1">
          <span>Pagado {fmt(pagado)}</span><span>de {fmt(target)}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${vencido ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="p-3">
        <BotonPagar token={token} concepto={concepto} editable maxMonto={falta} />
      </div>
    </section>
  )
}

// ── Marco visual ─────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cea.png" alt="CEA Aragón" className="w-9 h-9 rounded-full object-contain bg-white" />

          <div className="leading-tight">
            <p className="text-white font-semibold text-sm">CEA Aragón</p>
            <p className="text-white/40 text-[11px]">Escuela de Enfermería</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
