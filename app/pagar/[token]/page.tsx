// Página pública de pago por alumna — SIN login.
// Lee la alumna por su token (server-side con service_role) y muestra su adeudo
// SEPARADO en Mensualidad, Uniforme y Certificado, cada uno con su botón de pago.

import { createClient } from '@supabase/supabase-js'
import { MESES_FULL } from '@/lib/types'
import {
  mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, TIPOS_BACHI,
  aplicaDescuentoProntoPago, PRONTO_PAGO_MONTO, PRONTO_PAGO_DIA_LIMITE,
  type MesAdeudado,
} from '@/lib/acumulacion'
import {
  EXTRA_TARGET, estadoExtra, mesesTranscurridos,
} from '@/lib/extras'
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
    .from('alumnas').select('id, nombre, cuota_mensual, programa, status')
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

  // ── Mensualidad ──
  const adeudoCol = mesesAdeudadosCol(colRows, colLimit, hoyAnio, hoyMes)
  const adeudoBachi = mesesAdeudadosBachi(bachiRows, 1000, hoyAnio, mesToBachiTipo(hoyMes))
  const mensBruto = adeudoCol.reduce((s, m) => s + m.falta, 0) + adeudoBachi.reduce((s, m) => s + m.falta, 0)
  const descuento = aplicaDescuentoProntoPago(alumna.programa, hoyDia, adeudoCol, hoyAnio, hoyMes, colLimit) ? PRONTO_PAGO_MONTO : 0
  const mensTotal = Math.max(0, mensBruto - descuento)

  // ── Inicio de curso (mes más antiguo con registro) → vencimientos ──
  let start: { anio: number; mes: number } | null = null
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
                <span className="text-right">
                  {descuento > 0 && <span className="text-white/40 text-xs line-through mr-1.5">{fmt(mensBruto)}</span>}
                  <span className="text-white font-bold">{fmt(mensTotal)}</span>
                </span>
              </div>
              <ul className="px-4 py-1">
                {adeudoCol.map((m, i) => (
                  <li key={'c' + i} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-white/70">{mesLabelCol(m)}</span>
                    <span className="text-white/80 tabular-nums">{fmt(m.falta)}</span>
                  </li>
                ))}
                {adeudoBachi.map((m, i) => (
                  <li key={'b' + i} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-white/70">{mesLabelBachi(m)}</span>
                    <span className="text-white/80 tabular-nums">{fmt(m.falta)}</span>
                  </li>
                ))}
              </ul>
              {descuento > 0 && (
                <p className="px-4 pb-2 text-emerald-300 text-xs">🎉 Incluye −{fmt(descuento)} por pronto pago (antes del día {PRONTO_PAGO_DIA_LIMITE}).</p>
              )}
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
