'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, DIA_COLORS, Recordatorio } from '@/lib/types'
import { kvGet } from '@/lib/kv'
import type { PaymentCalendar, SueldoCalculado } from '@/lib/nomina'
import { sueldoDocente } from '@/lib/nomina'
import { useBackdropClose } from '@/lib/useBackdropClose'
import Link from 'next/link'
import {
  Check, Banknote, ClipboardCopy, Plus, X,
  ChevronLeft, ChevronRight, CalendarDays, Coffee, Wallet, Bell, AlertTriangle, Trash2, CalendarCheck, MessageCircle,
} from 'lucide-react'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
const DIA_POR_INDICE = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']
const CAL_KEY = 'payment_calendars_v2'

// Sueldos fijos de cada SÁBADO (montos confirmados por Alex).
const SUELDOS_SABADO = [
  { nombre: 'Alex',  rol: 'Mi sueldo', monto: 3000 },
  { nombre: 'Isela', rol: 'Ayudante',  monto: 1500 },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** ¿El concepto de un egreso de Caja se refiere a esta persona?
 *  Compara por nombre de pila y tolera variantes ("Isela" / "Isella"). */
function conceptoEsDe(concepto: string, nombre: string): boolean {
  const c = norm(concepto)
  const pila = norm(nombre).split(/\s+/)[0]
  if (!pila) return false
  return c.includes(pila) || (pila.length > 4 && c.includes(pila.slice(0, -1)))
}

interface GrupoDia { grupo: Grupo; alumnas: number }
// Citas de visita al plantel del agente de WhatsApp (ver página Citas)
interface CitaDia { id: string; inicio: string; estado: string; modalidad: string | null; leads: { nombre: string | null; telefono: string } }
const CITA_ESTADO: Record<string, [string, string]> = {
  agendada: ['Sin confirmar', 'bg-amber-50 text-amber-700'], confirmada: ['Confirmada', 'bg-blue-50 text-blue-700'],
  llego: ['Llegó', 'bg-emerald-50 text-emerald-700'], no_llego: ['No llegó', 'bg-red-50 text-red-600'],
}
const horaCita = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
interface PagoNomina {
  grupo: Grupo; docente: string; sueldo: SueldoCalculado
  pagadoHoy: boolean; montoPagadoHoy: number
}
interface PagoFijo {
  nombre: string; rol: string; monto: number
  pagadoHoy: boolean; montoPagadoHoy: number
}

export default function HoyPage() {
  const [offset, setOffset] = useState(0)
  const [gruposDia, setGruposDia] = useState<GrupoDia[]>([])
  const [nomina, setNomina] = useState<PagoNomina[]>([])
  const [fijos, setFijos] = useState<PagoFijo[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [citasDia, setCitasDia] = useState<CitaDia[]>([])
  const [alumnasTodas, setAlumnasTodas] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [copiadoGuion, setCopiadoGuion] = useState(false)
  const [modalRec, setModalRec] = useState<{ alumnaId: string | null } | null>(null)
  const supabase = createClient()

  const fecha = useMemo(
    () => new Date(Date.now() - 6 * 3600 * 1000 + offset * 86400000),
    [offset],
  )
  const fechaStr = fecha.toISOString().slice(0, 10)
  const hoyStr = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10)
  const diaCode = DIA_POR_INDICE[fecha.getUTCDay()]
  const fechaLabel = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(fecha)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const manana = new Date(new Date(fechaStr + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    const [{ data: gr }, { data: al }, { data: movs }, { data: recs }, cals, { data: cts }] =
      await Promise.all([
        supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
        supabase.from('alumnas').select('id,nombre,grupo_id')
          .eq('user_id', user.id).eq('status', 'activa').order('nombre'),
        supabase.from('movimientos_caja').select('fecha,concepto,monto')
          .eq('user_id', user.id).eq('tipo', 'egreso').eq('categoria', 'sueldos')
          .order('fecha', { ascending: false }).limit(200),
        supabase.from('recordatorios').select('*, alumna:alumnas(nombre)')
          .eq('user_id', user.id).order('fecha'),
        kvGet<PaymentCalendar[]>(supabase, CAL_KEY),
        supabase.from('citas').select('id, inicio, estado, modalidad, leads!inner(nombre, telefono)')
          .gte('inicio', `${fechaStr}T00:00:00-06:00`).lt('inicio', `${manana}T00:00:00-06:00`)
          .in('estado', ['agendada', 'confirmada', 'llego', 'no_llego']).order('inicio'),
      ])
    setCitasDia((cts ?? []) as unknown as CitaDia[])

    setAlumnasTodas((al ?? []).map(a => ({ id: a.id, nombre: a.nombre })))
    setRecordatorios((recs ?? []) as Recordatorio[])

    const anioRef = fecha.getUTCFullYear(), mesRef = fecha.getUTCMonth() + 1
    const hoyMs = Date.UTC(anioRef, mesRef - 1, fecha.getUTCDate())
    const calendarios = Array.isArray(cals) ? cals : []
    const sueldosPagados = movs ?? []
    const cuentaAlumnas = (gid: string) => (al ?? []).filter(a => a.grupo_id === gid).length

    // ── Sueldos de docentes: solo en las fechas de pago del calendario del grupo ──
    const listaNomina: PagoNomina[] = []
    for (const g of (gr ?? [])) {
      if (!g.calendario_id || !g.maestra) continue
      const cal = calendarios.find(c => c.id === g.calendario_id)
      if (!cal) continue
      const s = sueldoDocente(cal, fechaStr, cuentaAlumnas(g.id))
      if (!s) continue
      const suyos = sueldosPagados.filter(m => conceptoEsDe(m.concepto ?? '', g.maestra!) && m.fecha === fechaStr)
      listaNomina.push({
        grupo: g, docente: g.maestra, sueldo: s,
        pagadoHoy: suyos.length > 0,
        montoPagadoHoy: suyos.reduce((acc, m) => acc + Number(m.monto), 0),
      })
    }

    // ── Sueldos fijos de sábado ───────────────────────────────────────────
    const listaFijos: PagoFijo[] = diaCode !== 'SAB' ? [] : SUELDOS_SABADO.map(s => {
      const suyos = sueldosPagados.filter(m => conceptoEsDe(m.concepto ?? '', s.nombre) && m.fecha === fechaStr)
      return {
        ...s,
        pagadoHoy: suyos.length > 0,
        montoPagadoHoy: suyos.reduce((acc, m) => acc + Number(m.monto), 0),
      }
    })

    // ── Grupos con clase este día ─────────────────────────────────────────
    const bloques: GrupoDia[] = (gr ?? []).filter(g => g.dia === diaCode).map(g => ({
      grupo: g, alumnas: cuentaAlumnas(g.id),
    }))

    setNomina(listaNomina)
    setFijos(listaFijos)
    setGruposDia(bloques)
    setLoading(false)
  }, [diaCode, fechaStr])

  useEffect(() => { load() }, [load])

  // Recordatorios: los del día + los atrasados sin hacer (solo al ver hoy)
  const recsDelDia = recordatorios.filter(r => r.fecha === fechaStr)
  const recsAtrasados = offset === 0
    ? recordatorios.filter(r => !r.hecho && r.fecha < hoyStr)
    : []

  const toggleRec = async (r: Recordatorio) => {
    const nuevo = !r.hecho
    setRecordatorios(prev => prev.map(x => x.id === r.id ? { ...x, hecho: nuevo } : x))
    const { error } = await supabase.from('recordatorios').update({ hecho: nuevo }).eq('id', r.id)
    if (error) setRecordatorios(prev => prev.map(x => x.id === r.id ? { ...x, hecho: !nuevo } : x))
  }

  const borrarRec = async (r: Recordatorio) => {
    const previo = recordatorios
    setRecordatorios(prev => prev.filter(x => x.id !== r.id))
    const { error } = await supabase.from('recordatorios').delete().eq('id', r.id)
    if (error) setRecordatorios(previo)
  }

  const crearRec = async (titulo: string, fechaRec: string, alumnaId: string | null): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Sesión expirada, vuelve a entrar.'
    const { data, error } = await supabase.from('recordatorios')
      .insert({ user_id: user.id, titulo, fecha: fechaRec, alumna_id: alumnaId })
      .select('*, alumna:alumnas(nombre)').single()
    if (error) return error.message
    setRecordatorios(prev => [...prev, data as Recordatorio])
    return null
  }

  const totalNomina = nomina.filter(p => !p.pagadoHoy).reduce((s, p) => s + p.sueldo.monto, 0)
    + fijos.filter(p => !p.pagadoHoy).reduce((s, p) => s + p.monto, 0)
  const pendientesRec = [...recsAtrasados, ...recsDelDia.filter(r => !r.hecho)].length

  const copiarGuion = () => {
    const L: string[] = [`GUION — ${fechaLabel}`, '']
    if (citasDia.length) {
      L.push('CITAS:')
      citasDia.forEach(c => L.push(`  ${horaCita(c.inicio)} ${c.leads.nombre || c.leads.telefono} — ${c.modalidad || '-'} (${CITA_ESTADO[c.estado]?.[0] ?? c.estado})`))
      L.push('')
    }
    if (recsAtrasados.length || recsDelDia.length) {
      L.push('RECORDATORIOS:')
      recsAtrasados.forEach(r => L.push(`  [ ] (ATRASADO ${r.fecha}) ${r.alumna?.nombre ? r.alumna.nombre + ' — ' : ''}${r.titulo}`))
      recsDelDia.forEach(r => L.push(`  ${r.hecho ? '[x]' : '[ ]'} ${r.alumna?.nombre ? r.alumna.nombre + ' — ' : ''}${r.titulo}`))
      L.push('')
    }
    if (nomina.length || fijos.length) {
      L.push('SUELDOS A PAGAR HOY:')
      nomina.forEach(p => L.push(
        `  ${p.pagadoHoy ? '[x]' : '[ ]'} ${p.docente} (${p.grupo.nombre}) — ${fmt(p.sueldo.monto)}` +
        ` = ${p.sueldo.alumnas} alumnas x ${p.sueldo.semanas} sem x $75`))
      fijos.forEach(p => L.push(`  ${p.pagadoHoy ? '[x]' : '[ ]'} ${p.nombre} (${p.rol}) — ${fmt(p.monto)}`))
      L.push('')
    }
    gruposDia.forEach(b => {
      L.push(`GRUPO ${b.grupo.nombre}${b.grupo.horario ? ` (${b.grupo.horario})` : ''} — ${b.alumnas} alumnas`)
      L.push('')
    })
    navigator.clipboard.writeText(L.join('\n')).then(() => {
      setCopiadoGuion(true); setTimeout(() => setCopiadoGuion(false), 1800)
    })
  }

  const filaRec = (r: Recordatorio, atrasado = false) => (
    <div key={r.id}
      className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
        atrasado ? 'bg-red-50/60 border-red-200'
        : r.hecho ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 shadow-sm'
      }`}>
      <button onClick={() => toggleRec(r)}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
          r.hecho ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
        }`} title={r.hecho ? 'Marcar como pendiente' : 'Marcar como hecho'}>
        {r.hecho && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${r.hecho ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
          {r.titulo}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {r.alumna?.nombre && <span className="text-xs text-blue-600 font-medium">{r.alumna.nombre}</span>}
          {atrasado && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> era del {r.fecha}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => borrarRec(r)}
        className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition flex-shrink-0" title="Eliminar">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Mi día</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">{fechaLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setModalRec({ alumnaId: null })}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus className="w-4 h-4" /> Recordatorio
            </button>
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
            <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100">
              <p className="text-[10px] md:text-xs text-violet-600 font-medium">Recordatorios</p>
              <p className="text-base md:text-xl font-bold text-violet-700">{pendientesRec}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
              <p className="text-[10px] md:text-xs text-blue-600 font-medium">Sueldos hoy</p>
              <p className="text-base md:text-xl font-bold text-blue-700 truncate">{fmt(totalNomina)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <p className="text-[10px] md:text-xs text-slate-500 font-medium">Grupos hoy</p>
              <p className="text-base md:text-xl font-bold text-slate-700">{gruposDia.length}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando…</div>
        ) : (
          <>
            {/* ── Citas del día ───────────────────────────────────────── */}
            {citasDia.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                  <CalendarCheck className="w-4 h-4 text-emerald-500" /> Citas ({citasDia.length})
                  <Link href="/citas" className="ml-auto text-xs font-medium normal-case text-blue-600 hover:underline">Marcar llegadas →</Link>
                </h2>
                <div className="space-y-2">
                  {citasDia.map(c => (
                    <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5">
                      <span className="text-sm font-bold text-slate-900 w-12">{horaCita(c.inicio)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.leads.nombre || 'Sin nombre'}</p>
                        <p className="text-xs text-slate-500 truncate">{c.modalidad || 'Modalidad sin indicar'}</p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CITA_ESTADO[c.estado]?.[1] ?? 'bg-slate-100 text-slate-500'}`}>
                        {CITA_ESTADO[c.estado]?.[0] ?? c.estado}
                      </span>
                      <a href={`https://wa.me/${c.leads.telefono}`} target="_blank" rel="noreferrer" title="Escribir por WhatsApp"
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><MessageCircle className="w-4 h-4" /></a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Recordatorios ───────────────────────────────────────── */}
            {(recsAtrasados.length > 0 || recsDelDia.length > 0) && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                  <Bell className="w-4 h-4 text-violet-500" /> Recordatorios
                </h2>
                <div className="space-y-2">
                  {recsAtrasados.map(r => filaRec(r, true))}
                  {recsDelDia.map(r => filaRec(r))}
                </div>
              </section>
            )}

            {/* ── Sueldos a pagar hoy ─────────────────────────────────── */}
            {(nomina.length > 0 || fijos.length > 0) && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                  <Banknote className="w-4 h-4 text-blue-500" /> Sueldos a pagar hoy
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {nomina.map(p => (
                    <div key={p.grupo.id}
                      className={`rounded-2xl border p-3.5 flex items-start justify-between gap-3 ${
                        p.pagadoHoy ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                      <div className="min-w-0">
                        <p className={`font-semibold ${p.pagadoHoy ? 'text-emerald-800' : 'text-slate-800'}`}>{p.docente}</p>
                        <p className="text-xs text-slate-500">Docente · {p.grupo.nombre}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {p.sueldo.alumnas} alumnas × {p.sueldo.semanas} {p.sueldo.semanas === 1 ? 'semana' : 'semanas'} × $75
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-lg font-bold ${p.pagadoHoy ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {fmt(p.sueldo.monto)}
                        </p>
                        {p.pagadoHoy && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <Check className="w-3 h-3" /> Pagado {fmt(p.montoPagadoHoy)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {fijos.map(p => (
                    <div key={p.nombre}
                      className={`rounded-2xl border p-3.5 flex items-start justify-between gap-3 ${
                        p.pagadoHoy ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                      <div className="min-w-0">
                        <p className={`font-semibold ${p.pagadoHoy ? 'text-emerald-800' : 'text-slate-800'}`}>{p.nombre}</p>
                        <p className="text-xs text-slate-500">{p.rol}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Fijo semanal (sábados)</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-lg font-bold ${p.pagadoHoy ? 'text-emerald-700' : 'text-slate-800'}`}>{fmt(p.monto)}</p>
                        {p.pagadoHoy && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <Check className="w-3 h-3" /> Pagado {fmt(p.montoPagadoHoy)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" />
                  Se marcan solos al registrar el egreso en Caja con categoría «sueldos».
                </p>
              </section>
            )}

            {/* ── Grupos con clase hoy ────────────────────────────────── */}
            {gruposDia.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
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
                    <span className="text-xs text-slate-400">{b.alumnas} alumnas</span>
                  </div>

                </section>
              )
            })}
          </>
        )}
      </div>

      {modalRec && (
        <RecordatorioModal
          alumnas={alumnasTodas}
          alumnaIdInicial={modalRec.alumnaId}
          fechaInicial={fechaStr}
          onSave={crearRec}
          onClose={() => setModalRec(null)}
        />
      )}
    </div>
  )
}

// ─── Modal para apuntar un recordatorio ──────────────────────────────────────
function RecordatorioModal({ alumnas, alumnaIdInicial, fechaInicial, onSave, onClose }: {
  alumnas: { id: string; nombre: string }[]
  alumnaIdInicial: string | null
  fechaInicial: string
  onSave: (titulo: string, fecha: string, alumnaId: string | null) => Promise<string | null>
  onClose: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState(fechaInicial)
  const [alumnaId, setAlumnaId] = useState<string>(alumnaIdInicial ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backdrop = useBackdropClose(onClose)

  const guardar = async () => {
    if (!titulo.trim() || !fecha) return
    setGuardando(true); setError(null)
    const err = await onSave(titulo.trim(), fecha, alumnaId || null)
    setGuardando(false)
    if (err) { setError(err); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Nuevo recordatorio</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">¿Qué tienes que tratar? *</label>
            <textarea value={titulo} onChange={e => setTitulo(e.target.value)} rows={2} autoFocus
              placeholder="Ej: Hablar de sus faltas de asistencia"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Alumna (opcional)</label>
            <select value={alumnaId} onChange={e => setAlumnaId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— Sin alumna concreta —</option>
              {alumnas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Recordármelo el día *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-[11px] text-slate-400 mt-1">Si ese día no lo marcas como hecho, seguirá saliendo como atrasado.</p>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} disabled={guardando}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando || !titulo.trim() || !fecha}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-40">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
