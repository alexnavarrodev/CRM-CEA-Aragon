'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, MovimientoCaja, MovimientoTipo, Canal, MESES } from '@/lib/types'
import { Plus, TrendingUp, TrendingDown, X, ArrowUpRight, ArrowDownRight, User } from 'lucide-react'

// ─── Labels ──────────────────────────────────────────────────────────────────
const CATEGORIA_LABELS: Record<string, string> = {
  inscripcion:   'Inscripción',
  colegiatura:   'Colegiatura',
  bachillerato:  'Bachillerato',
  ambos:         'Col. + Bachi',
  materiales:    'Materiales',
  otros:         'Otros',
  renta:         'Renta',
  sueldos:       'Sueldos',
  servicios:     'Servicios',
  mantenimiento: 'Mantenimiento',
}

const CANAL_LABELS: Record<Canal, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
}

// Bachillerato concept keys (matches COLUMNAS in bachillerato page)
const BACHI_CONCEPTOS = [
  { key: 'inscripcion', label: 'Inscripción' },
  { key: 'materiales',  label: 'Materiales' },
  ...MESES.map((m, i) => ({ key: m.toLowerCase(), label: m })),
]

// Derive bachillerato tipo from mes number (1=ene … 12=dic)
const mesToBachiTipo = (mes: number) => MESES[mes - 1].toLowerCase()

// ─── Page ────────────────────────────────────────────────────────────────────
type MovRow = MovimientoCaja & { alumna?: { nombre: string } | null }

export default function CajaPage() {
  const [movimientos, setMovimientos] = useState<MovRow[]>([])
  const [filtroTipo, setFiltroTipo] = useState<'todos' | MovimientoTipo>('todos')
  const [filtroMes, setFiltroMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('movimientos_caja')
      .select('*, alumna:alumnas(nombre)')
      .eq('user_id', user.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setMovimientos((data ?? []) as MovRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = movimientos.filter(m => {
    if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
    if (filtroMes) {
      const d = new Date(m.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key !== filtroMes) return false
    }
    if (busqueda && !m.concepto.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const totalIngresos = filtrados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const totalGastos   = filtrados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  const balance = totalIngresos - totalGastos

  // ── Save handler: registra movimiento_caja + pagos automáticos ───────────
  const handleAdd = async (payload: {
    tipo: MovimientoTipo; concepto: string; monto: number
    canal: Canal; categoria: string; fecha: string
    alumna_id: string | null; mes: number; tipoBachi: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { alumna_id, mes, tipoBachi, ...movData } = payload
    const anio = new Date(payload.fecha).getFullYear()

    // 1. Guardar movimiento en caja
    const { data: row } = await supabase
      .from('movimientos_caja')
      .insert({ ...movData, alumna_id: alumna_id || null, user_id: user.id })
      .select('*, alumna:alumnas(nombre)')
      .single()
    if (row) setMovimientos(prev => [row as MovRow, ...prev])

    // 2. Registrar en pagos_colegiaturas si aplica
    const upsertCol = async (montoCol: number) => {
      if (!alumna_id || !mes) return
      const { data: ex } = await supabase
        .from('pagos_colegiaturas').select('id')
        .eq('alumna_id', alumna_id).eq('anio', anio).eq('mes', mes).maybeSingle()
      if (ex) {
        await supabase.from('pagos_colegiaturas')
          .update({ monto: montoCol, estado: 'pagado', fecha_pago: payload.fecha })
          .eq('id', ex.id)
      } else {
        await supabase.from('pagos_colegiaturas').insert({
          user_id: user.id, alumna_id, anio, mes,
          monto: montoCol, estado: 'pagado', fecha_pago: payload.fecha,
        })
      }
    }

    // 3. Registrar en pagos_bachillerato si aplica
    const upsertBachi = async (montoBachi: number, tipo: string) => {
      if (!alumna_id || !tipo) return
      const { data: ex } = await supabase
        .from('pagos_bachillerato').select('id')
        .eq('alumna_id', alumna_id).eq('anio', anio).eq('tipo', tipo).maybeSingle()
      if (ex) {
        await supabase.from('pagos_bachillerato')
          .update({ monto: montoBachi, estado: 'pagado', fecha_pago: payload.fecha })
          .eq('id', ex.id)
      } else {
        await supabase.from('pagos_bachillerato').insert({
          user_id: user.id, alumna_id, anio, tipo,
          monto: montoBachi, estado: 'pagado', fecha_pago: payload.fecha,
        })
      }
    }

    if (alumna_id && payload.tipo === 'ingreso') {
      if (payload.categoria === 'colegiatura') await upsertCol(payload.monto)
      if (payload.categoria === 'bachillerato') await upsertBachi(payload.monto, tipoBachi)
      if (payload.categoria === 'ambos') {
        const mitad = payload.monto / 2
        await Promise.all([
          upsertCol(mitad),
          upsertBachi(mitad, mesToBachiTipo(mes)),
        ])
      }
    }

    setModal(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('movimientos_caja').delete().eq('id', id)
    setMovimientos(prev => prev.filter(m => m.id !== id))
  }

  const mesesOpciones = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    return { key, label }
  })

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Caja</h1>
            <p className="text-sm text-slate-400 mt-0.5">Control de ingresos y gastos</p>
          </div>
          <button onClick={() => setModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo movimiento
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              <p className="text-xs text-blue-600 font-medium">Ingresos</p>
            </div>
            <p className="text-xl font-bold text-blue-700">${totalIngresos.toLocaleString('es-MX')}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 border border-red-100">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <p className="text-xs text-red-600 font-medium">Gastos</p>
            </div>
            <p className="text-xl font-bold text-red-600">${totalGastos.toLocaleString('es-MX')}</p>
          </div>
          <div className={`rounded-xl p-3 border ${balance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <p className={`text-xs font-medium mb-1 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Balance</p>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${balance.toLocaleString('es-MX')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {mesesOpciones.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {(['todos', 'ingreso', 'egreso'] as const).map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${filtroTipo === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {t === 'todos' ? 'Todos' : t === 'ingreso' ? 'Ingresos' : 'Gastos'}
            </button>
          ))}
          <div className="relative ml-auto">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar concepto..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-52" />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-slate-400">Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">No hay movimientos para este período</p>
              <button onClick={() => setModal(true)} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
                + Registrar movimiento
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Concepto / Alumna</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Canal</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Monto</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(m => (
                  <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition group">
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${m.tipo === 'ingreso' ? 'bg-blue-50' : 'bg-red-50'}`}>
                          {m.tipo === 'ingreso'
                            ? <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                            : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
                        </span>
                        <div>
                          <p className="font-medium text-slate-800 leading-tight">{m.concepto}</p>
                          {m.alumna && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" />{m.alumna.nombre}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        m.categoria === 'ambos' ? 'bg-violet-50 text-violet-700' :
                        m.categoria === 'colegiatura' ? 'bg-blue-50 text-blue-700' :
                        m.categoria === 'bachillerato' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {CATEGORIA_LABELS[m.categoria] ?? m.categoria}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{CANAL_LABELS[m.canal as Canal] ?? m.canal}</td>
                    <td className={`px-5 py-3.5 text-right font-semibold ${m.tipo === 'ingreso' ? 'text-blue-600' : 'text-red-500'}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'}${Number(m.monto).toLocaleString('es-MX')}
                    </td>
                    <td className="px-3 py-3.5">
                      <button onClick={() => handleDelete(m.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition text-slate-300 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && <MovimientoModal onSave={handleAdd} onClose={() => setModal(false)} />}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function MovimientoModal({ onSave, onClose }: {
  onSave: (d: {
    tipo: MovimientoTipo; concepto: string; monto: number
    canal: Canal; categoria: string; fecha: string
    alumna_id: string | null; mes: number; tipoBachi: string
  }) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [alumnas, setAlumnas] = useState<Alumna[]>([])
  const [alumnaId, setAlumnaId] = useState<string>('')
  const [tipo, setTipo] = useState<MovimientoTipo>('ingreso')
  const [categoria, setCategoria] = useState('colegiatura')
  const [mes, setMes] = useState(new Date().getMonth() + 1) // 1-12
  const [tipoBachi, setTipoBachi] = useState(MESES[new Date().getMonth()].toLowerCase())
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [canal, setCanal] = useState<Canal>('efectivo')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))

  // Load alumnas
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('alumnas').select('*').eq('user_id', user.id).eq('status', 'activa').order('nombre')
        .then(({ data }) => setAlumnas(data ?? []))
    })
  }, [])

  const alumna = alumnas.find(a => a.id === alumnaId)
  const programa = alumna?.programa ?? null

  // ── Categorías disponibles según alumna y tipo ───────────────────────────
  const categoriasDisponibles: { key: string; label: string }[] = (() => {
    if (tipo === 'egreso') return [
      { key: 'renta', label: 'Renta' }, { key: 'sueldos', label: 'Sueldos' },
      { key: 'materiales', label: 'Materiales' }, { key: 'servicios', label: 'Servicios' },
      { key: 'mantenimiento', label: 'Mantenimiento' }, { key: 'otros', label: 'Otros' },
    ]
    if (!alumna) return [
      { key: 'inscripcion', label: 'Inscripción' }, { key: 'colegiatura', label: 'Colegiatura' },
      { key: 'bachillerato', label: 'Bachillerato' }, { key: 'materiales', label: 'Materiales' },
      { key: 'otros', label: 'Otros' },
    ]
    if (programa === 'colegiaturas')  return [{ key: 'colegiatura', label: 'Colegiatura' }, { key: 'otros', label: 'Otros' }]
    if (programa === 'bachillerato') return [{ key: 'bachillerato', label: 'Bachillerato' }, { key: 'otros', label: 'Otros' }]
    if (programa === 'ambos')        return [
      { key: 'ambos', label: 'Col. + Bachi ($÷2)' },
      { key: 'colegiatura', label: 'Solo Colegiatura' },
      { key: 'bachillerato', label: 'Solo Bachillerato' },
      { key: 'otros', label: 'Otros' },
    ]
    return [{ key: 'otros', label: 'Otros' }]
  })()

  // ── Auto-reset categoría cuando cambia alumna o tipo ────────────────────
  useEffect(() => {
    const primera = categoriasDisponibles[0]?.key ?? 'otros'
    setCategoria(primera)
  }, [alumnaId, tipo])

  // ── Mostrar campos contextuales ──────────────────────────────────────────
  const showMes      = tipo === 'ingreso' && (categoria === 'colegiatura' || categoria === 'ambos')
  const showBachiCol = tipo === 'ingreso' && categoria === 'bachillerato'
  const isAmbos      = categoria === 'ambos'
  const montoNum     = parseFloat(monto) || 0
  const mitad        = montoNum / 2

  // ── Auto-fill concepto ───────────────────────────────────────────────────
  useEffect(() => {
    if (!alumna) return
    const mesLabel = MESES[mes - 1]
    if (categoria === 'colegiatura') setConcepto(`Colegiatura ${alumna.nombre} — ${mesLabel}`)
    if (categoria === 'bachillerato') {
      const bc = BACHI_CONCEPTOS.find(b => b.key === tipoBachi)
      setConcepto(`Bachillerato ${alumna.nombre} — ${bc?.label ?? tipoBachi}`)
    }
    if (categoria === 'ambos') setConcepto(`Col.+Bachi ${alumna.nombre} — ${mesLabel}`)
  }, [alumna?.id, categoria, mes, tipoBachi])

  const handleSubmit = () => {
    if (!concepto.trim() || !monto) return
    onSave({ tipo, concepto: concepto.trim(), monto: montoNum, canal, categoria, fecha, alumna_id: alumnaId || null, mes, tipoBachi })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">Nuevo movimiento</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setTipo('ingreso')}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'ingreso' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
              Ingreso
            </button>
            <button onClick={() => setTipo('egreso')}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'egreso' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>
              Gasto
            </button>
          </div>

          {/* Alumna (solo ingresos) */}
          {tipo === 'ingreso' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Alumna</label>
              <select value={alumnaId} onChange={e => setAlumnaId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— Sin alumna / otro concepto —</option>
                {alumnas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}{a.programa === 'ambos' ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {alumna && (
                <p className="text-xs text-slate-400 mt-1 pl-1">
                  Programa: <span className="font-medium text-slate-600 capitalize">{alumna.programa}</span>
                  {alumna.programa === 'ambos' && ' — $2,000 (se divide en $1,000 c/u)'}
                </p>
              )}
            </div>
          )}

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {categoriasDisponibles.map(c => (
                <button key={c.key} onClick={() => setCategoria(c.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    categoria === c.key
                      ? c.key === 'ambos'       ? 'bg-violet-600 text-white border-violet-600'
                      : c.key === 'colegiatura' ? 'bg-blue-600 text-white border-blue-600'
                      : c.key === 'bachillerato'? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mes (colegiaturas / ambos) */}
          {showMes && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mes</label>
              <div className="flex flex-wrap gap-1.5">
                {MESES.map((m, i) => (
                  <button key={m} onClick={() => setMes(i + 1)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      mes === i + 1 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Concepto bachillerato */}
          {showBachiCol && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto bachillerato</label>
              <select value={tipoBachi} onChange={e => setTipoBachi(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {BACHI_CONCEPTOS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          )}

          {/* Concepto */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)}
              placeholder="Descripción del movimiento"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Monto + split preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0"
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Ambos split preview */}
          {isAmbos && montoNum > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm">
              <p className="text-violet-700 font-medium mb-1.5">División automática</p>
              <div className="flex justify-between text-violet-600 text-xs">
                <span>Colegiatura ({MESES[mes - 1]})</span>
                <span className="font-semibold">${mitad.toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between text-violet-600 text-xs mt-1">
                <span>Bachillerato ({MESES[mes - 1]})</span>
                <span className="font-semibold">${mitad.toLocaleString('es-MX')}</span>
              </div>
            </div>
          )}

          {/* Canal */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {(['efectivo', 'transferencia', 'tarjeta'] as Canal[]).map(c => (
                <button key={c} onClick={() => setCanal(c)}
                  className={`py-2 rounded-xl text-xs font-medium border transition capitalize ${
                    canal === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {CANAL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button onClick={handleSubmit}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-medium transition ${
                tipo === 'ingreso' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'
              }`}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
