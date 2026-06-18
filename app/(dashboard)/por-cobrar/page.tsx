'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MESES_FULL } from '@/lib/types'
import { mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, TIPOS_BACHI } from '@/lib/acumulacion'
import { MessageCircle, Link2, Check, AlertCircle, Phone } from 'lucide-react'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

interface MesPend { anio: number; mesNum: number; label: string; falta: number }
interface Deudora {
  id: string; nombre: string; telefono: string | null; pago_token: string | null
  total: number; meses: MesPend[]; atrasoDias: number
}

// Teléfono → formato wa.me MX (52 + 10 dígitos)
function waPhone(tel: string | null): string | null {
  if (!tel) return null
  let d = tel.replace(/\D/g, '')
  if (d.length === 10) d = '52' + d
  if (d.length === 11 && d.startsWith('1')) d = '52' + d.slice(1)
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3)
  return d.length === 12 && d.startsWith('52') ? d : (d.length >= 10 ? d : null)
}

export default function PorCobrarPage() {
  const [deudoras, setDeudoras] = useState<Deudora[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: col }, { data: ba }] = await Promise.all([
      supabase.from('alumnas').select('id,nombre,telefono,programa,cuota_mensual,pago_token')
        .eq('user_id', user.id).eq('status', 'activa'),
      supabase.from('pagos_colegiaturas').select('alumna_id,id,anio,mes,monto,estado').eq('user_id', user.id),
      supabase.from('pagos_bachillerato').select('alumna_id,id,anio,tipo,monto,estado').eq('user_id', user.id),
    ])

    const now = new Date(Date.now() - 6 * 3600 * 1000)
    const hoyA = now.getUTCFullYear(), hoyM = now.getUTCMonth() + 1
    const hoy = new Date(hoyA, hoyM - 1, now.getUTCDate())

    const lista: Deudora[] = []
    for (const a of (al ?? [])) {
      const lim = a.programa === 'ambos' ? 1000 : (Number(a.cuota_mensual) || 1000)
      const meses: MesPend[] = []
      if (a.programa === 'colegiaturas' || a.programa === 'ambos') {
        const ex = (col ?? []).filter(p => p.alumna_id === a.id)
        mesesAdeudadosCol(ex, lim, hoyA, hoyM).forEach(m =>
          meses.push({ anio: m.anio, mesNum: m.mes!, label: `${MESES_FULL[(m.mes! - 1)]} ${m.anio}`, falta: m.falta }))
      }
      if (a.programa === 'bachillerato' || a.programa === 'ambos') {
        const ex = (ba ?? []).filter(p => p.alumna_id === a.id)
        mesesAdeudadosBachi(ex, 1000, hoyA, mesToBachiTipo(hoyM)).forEach(m => {
          const idx = TIPOS_BACHI.indexOf((m.tipo ?? 'ene') as typeof TIPOS_BACHI[number])
          meses.push({ anio: m.anio, mesNum: idx + 1, label: `${MESES_FULL[idx]} ${m.anio} (bach.)`, falta: m.falta })
        })
      }
      if (meses.length === 0) continue
      const total = meses.reduce((s, m) => s + m.falta, 0)
      // mes más antiguo → días de atraso
      meses.sort((x, y) => (x.anio - y.anio) || (x.mesNum - y.mesNum))
      const o = meses[0]
      const ref = new Date(o.anio, o.mesNum - 1, 1)
      const atrasoDias = Math.max(0, Math.floor((hoy.getTime() - ref.getTime()) / 86400000))
      lista.push({ id: a.id, nombre: a.nombre, telefono: a.telefono, pago_token: a.pago_token, total, meses, atrasoDias })
    }
    lista.sort((a, b) => b.atrasoDias - a.atrasoDias || b.total - a.total)
    setDeudoras(lista)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const enlace = (token: string | null) => `${window.location.origin}/pagar/${token}`

  const copiar = (d: Deudora) => {
    if (!d.pago_token) return
    navigator.clipboard.writeText(enlace(d.pago_token)).then(() => {
      setCopiedId(d.id); setTimeout(() => setCopiedId(null), 1600)
    })
  }

  const whatsapp = (d: Deudora) => {
    const phone = waPhone(d.telefono)
    const mesesTxt = d.meses.map(m => m.label).join(', ')
    const msg = `Hola ${d.nombre} 👋\n\nTe recordamos tu pago pendiente de ${mesesTxt} (${fmt(d.total)}).\n\nPuedes pagar en línea (SPEI o tarjeta) aquí:\n${enlace(d.pago_token)}\n\n¡Gracias! — CEA Aragón`
    const base = phone ? `https://wa.me/${phone}` : `https://wa.me/`
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const totalGeneral = deudoras.reduce((s, d) => s + d.total, 0)

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Por cobrar</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {loading ? 'Cargando…' : `${deudoras.length} alumnas · ${fmt(totalGeneral)} pendiente · ordenadas por atraso`}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando…</div>
        ) : deudoras.length === 0 ? (
          <div className="text-center py-16">
            <Check className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">¡Todas al corriente! 🎉</p>
            <p className="text-slate-400 text-sm">No hay cobranza pendiente.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {deudoras.map(d => {
              const phone = waPhone(d.telefono)
              return (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{d.nombre}</p>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          d.atrasoDias >= 60 ? 'bg-red-100 text-red-700' :
                          d.atrasoDias >= 30 ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {d.atrasoDias} días de atraso
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {d.meses.map((m, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{m.label}</span>
                        ))}
                      </div>
                      {d.telefono && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-2"><Phone className="w-3 h-3" />{d.telefono}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-slate-800">{fmt(d.total)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => whatsapp(d)}
                      disabled={!d.pago_token}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition active:scale-95 disabled:opacity-40"
                      title={phone ? 'Abrir WhatsApp con el recordatorio' : 'Sin teléfono: se abrirá WhatsApp para elegir contacto'}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Recordar por WhatsApp
                    </button>
                    <button
                      onClick={() => copiar(d)}
                      disabled={!d.pago_token}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition active:scale-95 disabled:opacity-40 ${
                        copiedId === d.id ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Copiar enlace de pago"
                    >
                      {copiedId === d.id ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                    </button>
                  </div>
                  {!phone && d.telefono === null && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-2">
                      <AlertCircle className="w-3 h-3" /> Sin teléfono registrado — agrégalo en Alumnas para enviar directo.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
