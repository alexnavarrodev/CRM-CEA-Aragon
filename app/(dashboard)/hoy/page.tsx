'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, MESES_FULL, DIA_COLORS } from '@/lib/types'
import { mesesAdeudadosCol, mesesAdeudadosBachi, mesToBachiTipo, TIPOS_BACHI } from '@/lib/acumulacion'
import {
  MessageCircle, Link2, Check, Phone, Banknote, ClipboardCopy,
  ChevronLeft, ChevronRight, CalendarDays, Coffee, Wallet,
} from 'lucide-react'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

// JS getUTCDay() → código de día usado en `grupos.dia`
const DIA_POR_INDICE = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']

// Sueldos fijos que se pagan cada SÁBADO (montos confirmados por Alex, ago 2026).
// Los de las maestras NO son fijos (varían por grupo/semana), por eso solo se
// muestra el último pago como referencia en vez de inventar una cifra.
const SUELDOS_SABADO = [
  { nombre: 'Alex',  rol: 'Mi sueldo',           monto: 3000 },
  { nombre: 'Isela', rol: 'Ayudante',            monto: 1500 },
]

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** ¿El concepto de un movimiento de caja se refiere a esta persona?
 *  Compara por nombre de pila y tolera variantes ("Isela" / "Isella"). */
function conceptoEsDe(concepto: string, nombre: string): boolean {
  const c = norm(concepto)
  const pila = norm(nombre).split(/\s+/)[0]
  if (!pila) return false
  return c.includes(pila) || (pila.length > 4 && c.includes(pila.slice(0, -1)))
}

// Teléfono → formato wa.me MX (52 + 10 dígitos). Mismo criterio que Por cobrar.
function waPhone(tel: string | null): string | null {
  if (!tel) return null
  let d = tel.replace(/\D/g, '')
  if (d.length === 10) d = '52' + d
  if (d.length === 11 && d.startsWith('1')) d = '52' + d.slice(1)
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3)
  return d.length === 12 && d.startsWith('52') ? d : (d.length >= 10 ? d : null)
}

interface MesPend { label: string; falta: number }
interface AlumnaDia {
  id: string; nombre: string; telefono: string | null; pago_token: string | null
  meses: MesPend[]; total: number; atrasoDias: number
}
interface GrupoDia {
  grupo: Grupo
  conAdeudo: AlumnaDia[]
  alCorriente: number
  totalPorCobrar: number
}
interface PagoPersonal {
  nombre: string; rol: string
  montoFijo: number | null
  ultimoMonto: number | null; ultimaFecha: string | null
  pagadoHoy: boolean; montoPagadoHoy: number
}

export default function HoyPage() {
  const [offset, setOffset] = useState(0)
  const [gruposDia, setGruposDia] = useState<GrupoDia[]>([])
  const [pagosPersonal, setPagosPersonal] = useState<PagoPersonal[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiadoGuion, setCopiadoGuion] = useState(false)
  const supabase = createClient()

  // Fecha objetivo desplazada a "hora de México" (UTC−6) para leerla con getUTC*
  const fecha = useMemo(
    () => new Date(Date.now() - 6 * 3600 * 1000 + offset * 86400000),
    [offset],
  )
  const fechaStr = fecha.toISOString().slice(0, 10)
  const diaCode = DIA_POR_INDICE[fecha.getUTCDay()]
  const fechaLabel = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(fecha)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: gr }, { data: al }, { data: col }, { data: ba }, { data: movs }] = await Promise.all([
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
      supabase.from('alumnas').select('id,nombre,telefono,programa,cuota_mensual,pago_token,grupo_id')
        .eq('user_id', user.id).eq('status', 'activa').order('nombre'),
      supabase.from('pagos_colegiaturas').select('alumna_id,id,anio,mes,monto,estado').eq('user_id', user.id),
      supabase.from('pagos_bachillerato').select('alumna_id,id,anio,tipo,monto,estado').eq('user_id', user.id),
      supabase.from('movimientos_caja').select('fecha,concepto,monto,categoria,tipo')
        .eq('user_id', user.id).eq('tipo', 'egreso').eq('categoria', 'sueldos')
        .order('fecha', { ascending: false }).limit(200),
    ])

    const anioRef = fecha.getUTCFullYear(), mesRef = fecha.getUTCMonth() + 1
    const hoyDate = new Date(Date.UTC(anioRef, mesRef - 1, fecha.getUTCDate()))

    // ── Grupos que tienen clase este día ──────────────────────────────────
    const delDia = (gr ?? []).filter(g => g.dia === diaCode)
    const bloques: GrupoDia[] = delDia.map(g => {
      const suyas = (al ?? []).filter(a => a.grupo_id === g.id)
      const conAdeudo: AlumnaDia[] = []
      let alCorriente = 0

      for (const a of suyas) {
        const lim = a.programa === 'ambos' ? 1000 : (Number(a.cuota_mensual) || 1000)
        const meses: MesPend[] = []
        if (a.programa === 'colegiaturas' || a.programa === 'ambos') {
          mesesAdeudadosCol((col ?? []).filter(p => p.alumna_id === a.id), lim, anioRef, mesRef)
            .forEach(m => meses.push({ label: `${MESES_FULL[m.mes! - 1]} ${m.anio}`, falta: m.falta }))
        }
        if (a.programa === 'bachillerato' || a.programa === 'ambos') {
          mesesAdeudadosBachi((ba ?? []).filter(p => p.alumna_id === a.id), 1000, anioRef, mesToBachiTipo(mesRef))
            .forEach(m => {
              const idx = TIPOS_BACHI.indexOf((m.tipo ?? 'ene') as typeof TIPOS_BACHI[number])
              meses.push({ label: `${MESES_FULL[idx]} ${m.anio} (bach.)`, falta: m.falta })
            })
        }
        if (meses.length === 0) { alCorriente++; continue }

        // Días de atraso desde el mes pendiente más antiguo
        const propios = (col ?? []).filter(p => p.alumna_id === a.id)
        let atrasoDias = 0
        if (propios.length > 0) {
          const ini = propios.reduce((min, p) => (p.anio * 12 + p.mes) < (min.anio * 12 + min.mes) ? p : min)
          const desde = Date.UTC(ini.anio, ini.mes - 1, 1)
          atrasoDias = Math.max(0, Math.floor((hoyDate.getTime() - desde) / 86400000))
        }
        conAdeudo.push({
          id: a.id, nombre: a.nombre, telefono: a.telefono, pago_token: a.pago_token,
          meses, total: meses.reduce((s, m) => s + m.falta, 0), atrasoDias,
        })
      }
      conAdeudo.sort((x, y) => (y.atrasoDias - x.atrasoDias) || (y.total - x.total))
      return {
        grupo: g, conAdeudo, alCorriente,
        totalPorCobrar: conAdeudo.reduce((s, d) => s + d.total, 0),
      }
    })

    // ── Sueldos por pagar este día ────────────────────────────────────────
    const sueldos = movs ?? []
    const construir = (nombre: string, rol: string, montoFijo: number | null): PagoPersonal => {
      const suyos = sueldos.filter(m => conceptoEsDe(m.concepto ?? '', nombre))
      const deHoy = suyos.filter(m => m.fecha === fechaStr)
      const anteriores = suyos.filter(m => m.fecha !== fechaStr)
      // Varias docentes dan clase en días distintos con tarifas distintas (p. ej. Ximena
      // cobra diferente el viernes que el sábado). Como referencia se prefiere su último
      // pago del MISMO día de la semana; solo si no hay, se cae al más reciente.
      const mismoDia = anteriores.find(m => DIA_POR_INDICE[new Date(`${m.fecha}T00:00:00Z`).getUTCDay()] === diaCode)
      const previo = mismoDia ?? anteriores[0] ?? null
      return {
        nombre, rol, montoFijo,
        ultimoMonto: previo ? Number(previo.monto) : null,
        ultimaFecha: previo?.fecha ?? null,
        pagadoHoy: deHoy.length > 0,
        montoPagadoHoy: deHoy.reduce((s, m) => s + Number(m.monto), 0),
      }
    }

    const lista: PagoPersonal[] = []
    // Docente de cada grupo que da clase hoy (monto variable → solo referencia)
    for (const g of delDia) {
      if (!g.maestra) continue
      if (lista.some(p => norm(p.nombre) === norm(g.maestra!))) continue
      lista.push(construir(g.maestra, `Docente · ${g.nombre}`, null))
    }
    // Sueldos fijos de sábado
    if (diaCode === 'SAB') {
      for (const s of SUELDOS_SABADO) lista.push(construir(s.nombre, s.rol, s.monto))
    }

    setGruposDia(bloques)
    setPagosPersonal(lista)
    setLoading(false)
  }, [diaCode, fechaStr])

  useEffect(() => { load() }, [load])

  const enlace = (token: string | null) => `${window.location.origin}/pagar/${token}`

  const copiar = (d: AlumnaDia) => {
    if (!d.pago_token) return
    navigator.clipboard.writeText(enlace(d.pago_token)).then(() => {
      setCopiedId(d.id); setTimeout(() => setCopiedId(null), 1600)
    })
  }

  const whatsapp = (d: AlumnaDia) => {
    const phone = waPhone(d.telefono)
    const detalle = d.meses.length ? ` de ${d.meses.map(m => m.label).join(', ')}` : ''
    const msg = `Hola ${d.nombre}\n\nTe recordamos tu pago pendiente${detalle}.\n\nPuedes pagar en línea (Transferencia o tarjeta) aquí:\n${enlace(d.pago_token)}\n\n¡Gracias! — CEA Aragón`
    window.open(`${phone ? `https://wa.me/${phone}` : 'https://wa.me/'}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const totalDia = gruposDia.reduce((s, b) => s + b.totalPorCobrar, 0)
  const alumnasDia = gruposDia.reduce((s, b) => s + b.conAdeudo.length, 0)
  const pagosPendientes = pagosPersonal.filter(p => !p.pagadoHoy).length

  const copiarGuion = () => {
    const L: string[] = [`GUION — ${fechaLabel}`, '']
    if (pagosPersonal.length) {
      L.push('PAGOS QUE DEBO HACER:')
      pagosPersonal.forEach(p => {
        const monto = p.montoFijo != null ? fmt(p.montoFijo)
          : p.ultimoMonto != null ? `último ${fmt(p.ultimoMonto)}` : 'monto por definir'
        L.push(`  ${p.pagadoHoy ? '[x]' : '[ ]'} ${p.nombre} (${p.rol}) — ${p.pagadoHoy ? `pagado ${fmt(p.montoPagadoHoy)}` : monto}`)
      })
      L.push('')
    }
    gruposDia.forEach(b => {
      L.push(`GRUPO ${b.grupo.nombre}${b.grupo.horario ? ` (${b.grupo.horario})` : ''} — ${fmt(b.totalPorCobrar)} por cobrar`)
      if (!b.conAdeudo.length) L.push('  Todas al corriente.')
      b.conAdeudo.forEach(d => {
        L.push(`  [ ] ${d.nombre} — ${fmt(d.total)}: ${d.meses.map(m => m.label).join(', ')}${d.atrasoDias ? ` (${d.atrasoDias} días de atraso)` : ''}`)
      })
      L.push('')
    })
    navigator.clipboard.writeText(L.join('\n')).then(() => {
      setCopiadoGuion(true); setTimeout(() => setCopiadoGuion(false), 1800)
    })
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Mi día</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">{fechaLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset(o => o - 1)}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition" title="Día anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {offset !== 0 && (
              <button onClick={() => setOffset(0)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                Hoy
              </button>
            )}
            <button onClick={() => setOffset(o => o + 1)}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition" title="Día siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={copiarGuion}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition ${
                copiadoGuion ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {copiadoGuion ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
              {copiadoGuion ? 'Copiado' : 'Copiar guion'}
            </button>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <p className="text-[10px] md:text-xs text-slate-500 font-medium">Grupos hoy</p>
              <p className="text-base md:text-xl font-bold text-slate-700">{gruposDia.length}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
              <p className="text-[10px] md:text-xs text-amber-600 font-medium">Por cobrar</p>
              <p className="text-base md:text-xl font-bold text-amber-700 truncate">{fmt(totalDia)}</p>
              <p className="text-[10px] text-amber-600/70">{alumnasDia} alumnas</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
              <p className="text-[10px] md:text-xs text-blue-600 font-medium">Sueldos por pagar</p>
              <p className="text-base md:text-xl font-bold text-blue-700">{pagosPendientes}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando…</div>
        ) : (
          <>
            {/* ── Sueldos por pagar ───────────────────────────────────── */}
            {pagosPersonal.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                  <Banknote className="w-4 h-4 text-blue-500" /> Pagos que debo hacer
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pagosPersonal.map(p => (
                    <div key={p.nombre}
                      className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                        p.pagadoHoy ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                      <div className="min-w-0">
                        <p className={`font-semibold ${p.pagadoHoy ? 'text-emerald-800' : 'text-slate-800'}`}>{p.nombre}</p>
                        <p className="text-xs text-slate-500">{p.rol}</p>
                        {!p.pagadoHoy && p.montoFijo == null && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            {p.ultimoMonto != null
                              ? `Último pago: ${fmt(p.ultimoMonto)} · ${p.ultimaFecha}`
                              : 'Sin pagos previos registrados'}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {p.pagadoHoy ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-sm">
                              <Check className="w-4 h-4" /> Pagado
                            </span>
                            <p className="text-xs text-emerald-600">{fmt(p.montoPagadoHoy)}</p>
                          </>
                        ) : p.montoFijo != null ? (
                          <p className="text-lg font-bold text-slate-800">{fmt(p.montoFijo)}</p>
                        ) : (
                          <span className="text-xs text-slate-400">Monto variable</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" />
                  Se marcan como pagados solos cuando registras el egreso en Caja con categoría «sueldos».
                </p>
              </section>
            )}

            {/* ── Grupos del día ──────────────────────────────────────── */}
            {gruposDia.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                <Coffee className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay clases este día</p>
                <p className="text-slate-400 text-sm">Ningún grupo tiene clase en {diaCode}.</p>
              </div>
            ) : gruposDia.map(b => {
              const c = DIA_COLORS[b.grupo.dia] || { bg: '#94A3B8', text: '#fff' }
              return (
                <section key={b.grupo.id}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: c.bg }}>
                      {b.grupo.nombre}
                    </span>
                    {b.grupo.horario && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />{b.grupo.horario}
                      </span>
                    )}
                    {b.grupo.maestra && <span className="text-xs text-slate-400">· {b.grupo.maestra}</span>}
                    <div className="flex-1 border-t border-slate-100 min-w-4" />
                    <span className="text-xs font-semibold text-amber-700">{fmt(b.totalPorCobrar)} por cobrar</span>
                  </div>

                  {b.conAdeudo.length === 0 ? (
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 text-center">
                      <Check className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                      <p className="text-emerald-800 text-sm font-medium">Todo el grupo al corriente 🎉</p>
                      <p className="text-emerald-600/70 text-xs">{b.alCorriente} alumnas, nada que cobrar.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {b.conAdeudo.map(d => {
                        const phone = waPhone(d.telefono)
                        return (
                          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-slate-800">{d.nombre}</p>
                                  {d.atrasoDias > 0 && (
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                      d.atrasoDias >= 60 ? 'bg-red-100 text-red-700' :
                                      d.atrasoDias >= 30 ? 'bg-amber-100 text-amber-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {d.atrasoDias} días de atraso
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {d.meses.map((m, i) => (
                                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                      {m.label} · {fmt(m.falta)}
                                    </span>
                                  ))}
                                </div>
                                {d.telefono && (
                                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-2">
                                    <Phone className="w-3 h-3" />{d.telefono}
                                  </p>
                                )}
                              </div>
                              <p className="text-lg font-bold text-slate-800 flex-shrink-0">{fmt(d.total)}</p>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => whatsapp(d)} disabled={!d.pago_token}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition active:scale-95 disabled:opacity-40"
                                title={phone ? 'Abrir WhatsApp con el recordatorio' : 'Sin teléfono: se abrirá WhatsApp para elegir contacto'}>
                                <MessageCircle className="w-4 h-4" /> Recordar por WhatsApp
                              </button>
                              <button onClick={() => copiar(d)} disabled={!d.pago_token}
                                className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition active:scale-95 disabled:opacity-40 ${
                                  copiedId === d.id ? 'border-emerald-300 text-emerald-600 bg-emerald-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`} title="Copiar enlace de pago">
                                {copiedId === d.id ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {b.alCorriente > 0 && (
                        <p className="text-xs text-slate-400 text-center pt-1">
                          + {b.alCorriente} {b.alCorriente === 1 ? 'alumna al corriente' : 'alumnas al corriente'}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
