'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MovimientoCaja, MovimientoTipo, Canal } from '@/lib/types'
import { Plus, TrendingUp, TrendingDown, X, ArrowUpRight, ArrowDownRight } from 'lucide-react'

const CATEGORIAS_INGRESO = ['inscripcion', 'colegiatura', 'bachillerato', 'materiales', 'otros']
const CATEGORIAS_EGRESO  = ['renta', 'sueldos', 'materiales', 'servicios', 'mantenimiento', 'otros']

const CATEGORIA_LABELS: Record<string, string> = {
  inscripcion:   'Inscripción',
  colegiatura:   'Colegiatura',
  bachillerato:  'Bachillerato',
  materiales:    'Materiales',
  otros:         'Otros',
  renta:         'Renta',
  sueldos:       'Sueldos',
  servicios:     'Servicios',
  mantenimiento: 'Mantenimiento',
}

const CANAL_LABELS: Record<Canal, string> = {
  efectivo:     'Efectivo',
  transferencia:'Transferencia',
  tarjeta:      'Tarjeta',
}

export default function CajaPage() {
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
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
    const { data } = await supabase.from('movimientos_caja').select('*').eq('user_id', user.id).order('fecha', { ascending: false }).order('created_at', { ascending: false })
    setMovimientos(data ?? [])
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
  const totalEgresos  = filtrados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  const balance = totalIngresos - totalEgresos

  const handleAdd = async (data: { tipo: MovimientoTipo; concepto: string; monto: number; canal: Canal; categoria: string; fecha: string }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: row } = await supabase.from('movimientos_caja').insert({ ...data, user_id: user.id }).select().single()
    if (row) setMovimientos(prev => [row, ...prev])
    setModal(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('movimientos_caja').delete().eq('id', id)
    setMovimientos(prev => prev.filter(m => m.id !== id))
  }

  // Generate month options (last 12 months)
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
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
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
            <p className="text-xl font-bold text-red-600">${totalEgresos.toLocaleString('es-MX')}</p>
          </div>
          <div className={`rounded-xl p-3 border ${balance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <p className={`text-xs font-medium mb-1 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Balance</p>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${balance.toLocaleString('es-MX')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {mesesOpciones.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          {(['todos', 'ingreso', 'egreso'] as const).map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${filtroTipo === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {t === 'todos' ? 'Todos' : t === 'ingreso' ? 'Ingresos' : 'Gastos'}
            </button>
          ))}
          <div className="relative ml-auto">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar concepto..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-52"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
      </div>

      {/* List */}
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Concepto</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Canal</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Monto</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(m => (
                  <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition group">
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${m.tipo === 'ingreso' ? 'bg-blue-50' : 'bg-red-50'}`}>
                          {m.tipo === 'ingreso'
                            ? <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                            : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
                        </span>
                        <span className="font-medium text-slate-800">{m.concepto}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
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

function MovimientoModal({ onSave, onClose }: {
  onSave: (d: { tipo: MovimientoTipo; concepto: string; monto: number; canal: Canal; categoria: string; fecha: string }) => void
  onClose: () => void
}) {
  const [tipo, setTipo] = useState<MovimientoTipo>('ingreso')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [canal, setCanal] = useState<Canal>('efectivo')
  const [categoria, setCategoria] = useState('colegiatura')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))

  const categorias = tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO

  const handleSubmit = () => {
    if (!concepto || !monto) return
    onSave({ tipo, concepto, monto: parseFloat(monto) || 0, canal, categoria, fecha })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Nuevo movimiento</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Tipo toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => { setTipo('ingreso'); setCategoria('colegiatura') }}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'ingreso' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
              Ingreso
            </button>
            <button onClick={() => { setTipo('egreso'); setCategoria('renta') }}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'egreso' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>
              Gasto
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Descripción del movimiento"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {categorias.map(c => (
                  <option key={c} value={c}>{CATEGORIA_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
              <select value={canal} onChange={e => setCanal(e.target.value as Canal)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {(['efectivo', 'transferencia', 'tarjeta'] as Canal[]).map(c => (
                  <option key={c} value={c}>{CANAL_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={handleSubmit}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-medium transition ${tipo === 'ingreso' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'}`}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
