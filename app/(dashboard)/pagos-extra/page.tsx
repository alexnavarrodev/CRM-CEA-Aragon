'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, Grupo, DIA_COLORS } from '@/lib/types'
import { Check, ClipboardList } from 'lucide-react'
import { EXTRA_TARGET, EXTRA_LABEL, estadoExtra, mesesTranscurridos } from '@/lib/extras'

const CONCEPTOS = ['rcp', 'uniforme', 'certificado'] as const
type Concepto = typeof CONCEPTOS[number]
type Extras = Record<Concepto, number>

interface Row {
  alumna: Alumna
  extras: Extras
  elapsed: number | null
}

export default function PagosExtraPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<{ alumnaId: string; concepto: Concepto } | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: ex }, { data: col }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).order('nombre'),
      supabase.from('pagos_extras').select('alumna_id, concepto, monto').eq('user_id', user.id),
      supabase.from('pagos_colegiaturas').select('alumna_id, anio, mes').eq('user_id', user.id),
    ])
    const exMap: Record<string, Extras> = {}
    ;(ex ?? []).forEach(p => {
      if (!exMap[p.alumna_id]) exMap[p.alumna_id] = { rcp: 0, uniforme: 0, certificado: 0 }
      const c = p.concepto as Concepto
      if (CONCEPTOS.includes(c)) exMap[p.alumna_id][c] = Number(p.monto)
    })
    const iniMap: Record<string, { anio: number; mes: number }> = {}
    ;(col ?? []).forEach(p => {
      const cur = iniMap[p.alumna_id]
      if (!cur || (p.anio * 12 + p.mes) < (cur.anio * 12 + cur.mes)) iniMap[p.alumna_id] = { anio: p.anio, mes: p.mes }
    })
    const now = new Date(Date.now() - 6 * 3600 * 1000)
    setRows((al ?? []).map(a => {
      const ini = iniMap[a.id]
      const elapsed = ini ? mesesTranscurridos(ini.anio, ini.mes, now.getUTCFullYear(), now.getUTCMonth() + 1) : null
      return { alumna: a, extras: exMap[a.id] ?? { rcp: 0, uniforme: 0, certificado: 0 }, elapsed }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const guardarExtra = async (alumnaId: string, concepto: Concepto, montoRaw: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const monto = Math.max(0, Math.min(EXTRA_TARGET[concepto], montoRaw))
    const estado = monto >= EXTRA_TARGET[concepto] ? 'pagado' : monto > 0 ? 'parcial' : 'pendiente'
    const { data: existente } = await supabase.from('pagos_extras')
      .select('id').eq('alumna_id', alumnaId).eq('concepto', concepto).maybeSingle()
    if (existente) {
      await supabase.from('pagos_extras').update({ monto, estado }).eq('id', existente.id)
    } else {
      await supabase.from('pagos_extras').insert({ user_id: user.id, alumna_id: alumnaId, concepto, monto, estado })
    }
    setRows(prev => prev.map(r => r.alumna.id === alumnaId ? { ...r, extras: { ...r.extras, [concepto]: monto } } : r))
  }

  const empezarEdicion = (alumnaId: string, concepto: Concepto, actual: number) => {
    setEditando({ alumnaId, concepto })
    setValorEdit(String(actual))
  }

  const confirmarEdicion = () => {
    if (!editando) return
    guardarExtra(editando.alumnaId, editando.concepto, parseFloat(valorEdit) || 0)
    setEditando(null)
  }

  const liquidadasCount = rows.filter(r => CONCEPTOS.every(c => r.extras[c] >= EXTRA_TARGET[c])).length

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">RCP / Uniforme / Certificado</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {loading ? 'Cargando…' : `${rows.length} alumnas · ${liquidadasCount} con las 3 liquidadas`}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
            <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay alumnas registradas</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left font-semibold text-slate-600 px-4 py-3 sticky left-0 bg-slate-50 z-10">NOMBRE</th>
                    <th className="text-left font-semibold text-slate-600 px-4 py-3">GRUPO</th>
                    {CONCEPTOS.map(c => (
                      <th key={c} className="text-center font-semibold text-slate-600 px-3 py-3 whitespace-nowrap">
                        {EXTRA_LABEL[c].toUpperCase()} <span className="font-normal text-slate-400">(${EXTRA_TARGET[c].toLocaleString('es-MX')})</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ alumna, extras, elapsed }) => {
                    const completa = CONCEPTOS.every(c => extras[c] >= EXTRA_TARGET[c])
                    const c = alumna.grupo ? (DIA_COLORS[alumna.grupo.dia] || { bg: '#94A3B8', text: '#fff' }) : null
                    return (
                      <tr key={alumna.id} className={`border-b border-slate-100 transition ${completa ? 'bg-green-500' : 'hover:bg-slate-50'}`}>
                        <td className={`px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10 ${completa ? 'bg-green-500 text-white' : 'bg-white text-slate-800'}`}>
                          {alumna.nombre}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {alumna.grupo && c ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.bg }}>{alumna.grupo.dia}</span>
                              <span className={completa ? 'text-white' : 'text-slate-600'}>{alumna.grupo.nombre}</span>
                            </span>
                          ) : (
                            <span className={completa ? 'text-white/70' : 'text-slate-300'}>—</span>
                          )}
                        </td>
                        {CONCEPTOS.map(concepto => {
                          const st = estadoExtra(concepto, extras[concepto], elapsed)
                          const editandoEsta = editando?.alumnaId === alumna.id && editando?.concepto === concepto
                          if (editandoEsta) {
                            return (
                              <td key={concepto} className="px-3 py-2">
                                <input
                                  autoFocus
                                  type="number" min="0" max={st.target}
                                  value={valorEdit}
                                  onChange={e => setValorEdit(e.target.value)}
                                  onBlur={confirmarEdicion}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmarEdicion()
                                    if (e.key === 'Escape') setEditando(null)
                                  }}
                                  className="w-24 mx-auto block px-2 py-1 border border-blue-400 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                            )
                          }
                          return (
                            <td key={concepto} className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => empezarEdicion(alumna.id, concepto, extras[concepto])}
                                title="Clic para ajustar el monto"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                                  st.completo
                                    ? (completa ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                                    : st.vencido
                                      ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                      : st.porVencer
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                        : (completa ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')
                                }`}
                              >
                                {st.completo
                                  ? <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Liquidado</>
                                  : `Falta $${st.falta.toLocaleString('es-MX')}`}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
