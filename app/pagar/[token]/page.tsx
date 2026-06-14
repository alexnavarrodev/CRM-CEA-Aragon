// Página pública de pago por alumna — SIN login.
// Lee la alumna por su token (server-side con service_role; nunca se expone al cliente)
// y calcula su adeudo en vivo reutilizando lib/acumulacion.ts.

import { createClient } from '@supabase/supabase-js'
import { MESES_FULL } from '@/lib/types'
import {
  mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, TIPOS_BACHI,
  type MesAdeudado,
} from '@/lib/acumulacion'

export const dynamic = 'force-dynamic' // siempre calcular en vivo

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

// Cliente admin (solo servidor). La service key vive en variable de entorno del servidor.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function mesLabelCol(m: MesAdeudado) {
  return `${MESES_FULL[(m.mes ?? 1) - 1]} ${m.anio}`
}
function mesLabelBachi(m: MesAdeudado) {
  const idx = TIPOS_BACHI.indexOf((m.tipo ?? 'ene') as typeof TIPOS_BACHI[number])
  return `${MESES_FULL[idx]} ${m.anio} (bach.)`
}

export default async function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Fecha de corte = mes actual (hora de México, UTC-6)
  const now = new Date(Date.now() - 6 * 3600 * 1000)
  const hoyAnio = now.getUTCFullYear()
  const hoyMes = now.getUTCMonth() + 1

  const supabase = adminClient()

  const { data: alumna } = await supabase
    .from('alumnas')
    .select('id, nombre, cuota_mensual, programa, status')
    .eq('pago_token', token)
    .maybeSingle()

  // Token inválido → no revelar nada
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

  let adeudoCol: MesAdeudado[] = []
  let adeudoBachi: MesAdeudado[] = []

  if (esCol) {
    const { data } = await supabase
      .from('pagos_colegiaturas').select('id, anio, mes, monto, estado')
      .eq('alumna_id', alumna.id)
    adeudoCol = mesesAdeudadosCol(data ?? [], colLimit, hoyAnio, hoyMes)
  }
  if (esBachi) {
    const { data } = await supabase
      .from('pagos_bachillerato').select('id, anio, tipo, monto, estado')
      .eq('alumna_id', alumna.id)
    adeudoBachi = mesesAdeudadosBachi(data ?? [], 1000, hoyAnio, mesToBachiTipo(hoyMes))
  }

  const total =
    adeudoCol.reduce((s, m) => s + m.falta, 0) +
    adeudoBachi.reduce((s, m) => s + m.falta, 0)

  const alCorriente = total <= 0

  return (
    <Shell>
      {/* Saludo */}
      <div className="text-center mb-6">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Estado de cuenta</p>
        <h1 className="text-2xl font-bold text-white">{alumna.nombre}</h1>
      </div>

      {alCorriente ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 p-8 text-center">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-emerald-300 font-semibold text-lg">Estás al corriente</p>
          <p className="text-white/50 text-sm mt-1">No tienes pagos pendientes. ¡Gracias!</p>
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="rounded-2xl bg-white/8 border border-white/10 p-6 text-center mb-4">
            <p className="text-white/50 text-xs uppercase tracking-widest mb-1">Adeudo total</p>
            <p className="text-4xl font-bold text-white tabular-nums">{fmt(total)}</p>
          </div>

          {/* Desglose */}
          <div className="rounded-2xl bg-white/8 border border-white/10 overflow-hidden mb-5">
            <p className="px-4 py-2.5 text-xs font-semibold text-white/40 uppercase tracking-wider border-b border-white/10">
              Meses pendientes
            </p>
            <ul>
              {adeudoCol.map((m, i) => (
                <li key={'c' + i} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 last:border-0">
                  <span className="text-white/80 text-sm">{mesLabelCol(m)}</span>
                  <span className="text-white font-medium text-sm tabular-nums">{fmt(m.falta)}</span>
                </li>
              ))}
              {adeudoBachi.map((m, i) => (
                <li key={'b' + i} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 last:border-0">
                  <span className="text-white/80 text-sm">{mesLabelBachi(m)}</span>
                  <span className="text-white font-medium text-sm tabular-nums">{fmt(m.falta)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pago en línea — próximamente (paso 3) */}
          <div className="rounded-2xl bg-blue-500/10 border border-blue-400/25 p-4 text-center">
            <p className="text-blue-200 text-sm font-medium mb-1">💳 Pago en línea muy pronto</p>
            <p className="text-white/50 text-xs leading-relaxed">
              Por ahora paga en el despacho o por transferencia. En breve podrás pagar
              aquí mismo con SPEI o tarjeta.
            </p>
          </div>
        </>
      )}
    </Shell>
  )
}

// ── Marco visual (mobile-first, estilo de la app) ────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
            FN
          </div>
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm">Florencia Nightingale</p>
            <p className="text-white/40 text-[11px]">Escuela de Enfermería</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
