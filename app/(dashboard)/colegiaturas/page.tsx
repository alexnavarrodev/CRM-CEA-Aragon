'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, Grupo, PagoColegiatura, MESES, PagoEstado, DIA_COLORS } from '@/lib/types'
import { Download, Plus, Check, X } from 'lucide-react'

const ANIO = new Date().getFullYear()

type PagoMap = Record<string, Record<number, PagoColegiatura>>

export default function ColegiatutasPage() {
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [pagos, setPagos] = useState<PagoMap>({})
  const [grupoFiltro, setGrupoFiltro] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<PagoEstado[]>(['pagado', 'parcial', 'pendiente'])
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<{ alumna: Alumna; mes: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: al }, { data: gr }, { data: pg }] = await Promise.all([
      supabase.from('alumnas').select('*, grupo:grupos(*)').eq('user_id', user.id).in('programa', ['colegiaturas', 'ambos']).eq('status', 'activa').order('nombre'),
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
      supabase.from('pagos_colegiaturas').select('*').eq('user_id', user.id).eq('anio', ANIO),
    ])
    setAlumnas(al ?? [])
    setGrupos(gr ?? [])
    const map: PagoMap = {}
    ;(pg ?? []).forEach(p => {
      if (!map[p.alumna_id]) map[p.alumna_id] = {}
      map[p.alumna_id][p.mes] = p
    })
    setPagos(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleFiltro = (e: PagoEstado) => {
    setFiltroEstado(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  }

  const alumnasFiltradas = alumnas.filter(a => {
    if (grupoFiltro !== 'todos' && a.grupo_id !== grupoFiltro) return false
    if (busqueda && !a.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  // Totales por mes
  const totalesMes = MESES.map((_, i) => {
    const mes = i + 1
    return alumnasFiltradas.reduce((sum, a) => {
      const p = pagos[a.id]?.[mes]
      return sum + (p ? Number(p.monto) : 0)
    }, 0)
  })

  const totalCobrado = totalesMes.reduce((a, b) => a + b, 0)
  const totalEsperado = alumnas.reduce((s, a) => s + Number(a.cuota_mensual) * 12, 0)

  const handleCellClick = (alumna: Alumna, mes: number) => {
    setModal({ alumna, mes })
  }

  const handlePago = async (monto: number, estado: PagoEstado) => {
    if (!modal) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = pagos[modal.alumna.id]?.[modal.mes]
    let row
    if (existing) {
      const { data } = await supabase.from('pagos_colegiaturas').update({ monto, estado, fecha_pago: new Date().toISOString().slice(0, 10) }).eq('id', existing.id).select().single()
      row = data
    } else {
      const { data } = await supabase.from('pagos_colegiaturas').insert({ user_id: user.id, alumna_id: modal.alumna.id, anio: ANIO, mes: modal.mes, monto, estado, fecha_pago: new Date().toISOString().slice(0, 10) }).select().single()
      row = data
    }
    if (row) {
      setPagos(prev => ({ ...prev, [modal.alumna.id]: { ...prev[modal.alumna.id], [modal.mes]: row } }))
    }
    setModal(null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Colegiaturas {ANIO}</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Cobrado{' '}
              <span className="font-semibold text-slate-700">${totalCobrado.toLocaleString('es-MX')}</span>
              {' '}de <span className="font-semibold">${totalEsperado.toLocaleString('es-MX')}</span> esperados en el año
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition shadow-sm">
              <Download className="w-4 h-4" /> Descargar
            </button>
          </div>
        </div>

        {/* Group filters */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button
            onClick={() => setGrupoFiltro('todos')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${grupoFiltro === 'todos' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          >
            Todos los grupos
          </button>
          {grupos.map(g => {
            const c = DIA_COLORS[g.dia] || { bg: '#94A3B8', text: '#fff' }
            const active = grupoFiltro === g.id
            return (
              <button key={g.id} onClick={() => setGrupoFiltro(active ? 'todos' : g.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition border"
                style={{ background: active ? c.bg : '#fff', color: active ? c.text : '#475569', borderColor: active ? c.bg : '#E2E8F0' }}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.bg }}>{g.dia}</span>
                {g.nombre}
              </button>
            )
          })}
        </div>

        {/* Search + estado filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar alumna..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-56"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {(['pagado', 'parcial', 'pendiente'] as PagoEstado[]).map(e => (
            <label key={e} className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={filtroEstado.includes(e)} onChange={() => toggleFiltro(e)}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-slate-600 capitalize">{e === 'pagado' ? 'Pagado' : e === 'parcial' ? 'Parcial' : 'Pendiente'}</span>
              {e === 'parcial' && <span className="w-3.5 h-3.5 rounded bg-amber-500 inline-block" />}
            </label>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-52">ALUMNA · GRUPO</th>
                {MESES.map((m, i) => (
                  <th key={m} className={`text-center px-2 py-3 min-w-[80px] ${i + 1 === new Date().getMonth() + 1 ? 'bg-blue-50/60' : ''}`}>
                    <div className="text-xs font-semibold text-slate-500 uppercase">{m}</div>
                    <div className="text-xs text-slate-400 font-normal">${(totalesMes[i] / 1000).toFixed(0)}K</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="text-center py-16 text-slate-400">Cargando...</td></tr>
              ) : alumnasFiltradas.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-16 text-slate-400">No hay alumnas en este grupo</td></tr>
              ) : (
                alumnasFiltradas.map((alumna, idx) => {
                  const g = alumna.grupo
                  const c = g ? (DIA_COLORS[g.dia] || { bg: '#3B82F6' }) : { bg: '#94A3B8' }
                  return (
                    <tr key={alumna.id} className={`border-t border-slate-50 hover:bg-slate-50/40 transition ${idx === 0 || (idx > 0 && alumnasFiltradas[idx - 1].grupo_id !== alumna.grupo_id) ? 'border-t-2 border-t-slate-100' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-800">{alumna.nombre}</div>
                        <div className="text-xs text-slate-400">${Number(alumna.cuota_mensual).toLocaleString('es-MX')}/mes</div>
                      </td>
                      {MESES.map((_, i) => {
                        const mes = i + 1
                        const pago = pagos[alumna.id]?.[mes]
                        const estado = pago?.estado ?? 'pendiente'
                        if (!filtroEstado.includes(estado)) {
                          return <td key={mes} className="px-2 py-2 text-center" />
                        }
                        return (
                          <td key={mes} className={`px-2 py-2 text-center ${mes === new Date().getMonth() + 1 ? 'bg-blue-50/30' : ''}`}>
                            <button
                              onClick={() => handleCellClick(alumna, mes)}
                              className="flex items-center justify-center gap-1.5 mx-auto rounded-lg px-2 py-1 transition hover:scale-105 active:scale-95"
                            >
                              {estado === 'pagado' ? (
                                <><span className="font-medium text-slate-700">${Number(pago!.monto).toLocaleString('es-MX')}</span>
                                <span className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span></>
                              ) : estado === 'parcial' ? (
                                <><span className="font-medium text-slate-700">${Number(pago!.monto).toLocaleString('es-MX')}</span>
                                <span className="w-5 h-5 bg-amber-500 rounded" /></>
                              ) : (
                                <span className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-400 transition">
                                  <Plus className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment modal */}
      {modal && (
        <PaymentModal
          alumna={modal.alumna}
          mes={modal.mes}
          existing={pagos[modal.alumna.id]?.[modal.mes]}
          onSave={handlePago}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function PaymentModal({ alumna, mes, existing, onSave, onClose }: {
  alumna: Alumna; mes: number; existing?: PagoColegiatura
  onSave: (monto: number, estado: PagoEstado) => void; onClose: () => void
}) {
  const [monto, setMonto] = useState(existing?.monto?.toString() ?? alumna.cuota_mensual.toString())
  const [estado, setEstado] = useState<PagoEstado>(existing?.estado ?? 'pagado')
  const mesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Registrar pago</h3>
            <p className="text-xs text-slate-400">{alumna.nombre} · {mesNombre}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {(['pagado','parcial','pendiente'] as PagoEstado[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`py-2 rounded-xl text-sm font-medium border transition capitalize ${estado === e
                    ? e === 'pagado' ? 'bg-blue-600 text-white border-blue-600'
                      : e === 'parcial' ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={() => onSave(parseFloat(monto) || 0, estado)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
