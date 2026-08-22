// Página pública de inscripción — SIN login, sin token. Un solo enlace fijo para
// mandar a cualquier prospecto (WhatsApp, redes, etc.) mientras se le convence de
// inscribirse. Paga la cuota de inscripción y queda registrado como prospecto
// "Inscrito" en el CRM (el alta completa de Alumna — grupo, programa — se hace
// después, manualmente, como con cualquier otro prospecto).

import InscripcionForm from './InscripcionForm'

export const dynamic = 'force-dynamic'

const INSCRIPCION_MONTO = 500

export default async function InscribetePage({ searchParams }: {
  searchParams: Promise<{ pago?: string }>
}) {
  const { pago } = await searchParams

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cea.png" alt="CEA Aragón" className="w-11 h-11 rounded-full object-contain bg-white" />
          <div className="leading-tight text-left">
            <p className="text-white font-semibold text-sm">Colegio de Enfermería Ángeles</p>
            <p className="text-white/40 text-[11px]">Plantel Aragón</p>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1.5">Aparta tu lugar</h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Paga tu inscripción en línea y un asesor te contacta por WhatsApp para agendar tu cita.
          </p>
        </div>

        {pago === 'ok' && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 mb-4 text-center">
            <p className="text-emerald-300 text-sm font-medium">¡Pago recibido! 🎉</p>
            <p className="text-white/50 text-xs mt-0.5">En breve un asesor te escribe por WhatsApp para agendar tu cita.</p>
          </div>
        )}
        {pago === 'pend' && (
          <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 mb-4 text-center">
            <p className="text-amber-300 text-sm font-medium">Pago en proceso</p>
            <p className="text-white/50 text-xs mt-0.5">Si pagaste por transferencia, puede tardar unos minutos.</p>
          </div>
        )}
        {pago === 'err' && (
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 px-4 py-3 mb-4 text-center">
            <p className="text-red-300 text-sm font-medium">El pago no se completó</p>
            <p className="text-white/50 text-xs mt-0.5">Puedes intentar de nuevo abajo.</p>
          </div>
        )}

        <section className="rounded-2xl bg-white/8 border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Inscripción</span>
            <span className="text-white font-bold text-lg">${INSCRIPCION_MONTO.toLocaleString('es-MX')}</span>
          </div>
          <div className="p-4">
            <InscripcionForm />
          </div>
        </section>

        <p className="text-white/25 text-[11px] text-center mt-6">
          Pago seguro procesado por Mercado Pago.
        </p>
      </div>
    </div>
  )
}
