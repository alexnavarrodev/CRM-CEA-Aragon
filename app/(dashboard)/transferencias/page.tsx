'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MovimientoCaja, MovimientoTipo, Canal } from '@/lib/types'
import { ArrowUpRight, ArrowDownRight, Plus, X, User, Pencil, Trash2, Wallet } from 'lucide-react'

type MovRow = MovimientoCaja & { alumna?: { nombre: string } | null }

const CANAL_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mixto: 'Mixto',
}

export default function TransferenciasPage() {
  const [movimientos, setMovimientos] = useState<MovRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('movimientos_caja')
      .select('*, alumna:alumnas(nombre)')
      .eq('user_id', user.id)
      .eq('canal', 'transferencia')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setMovimientos((data ?? []) as MovRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const totalEntradas = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const totalSalidas  = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  const saldo         = totalEntradas - totalSalidas

  const handleAdd = async (payload: {
    tipo: MovimientoTipo; concepto: string; monto: number; categoria: string; fecha: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: row } = await supabase
      .from('movimientos_caja')
      .insert({ ...payload, canal: 'transferencia', alumna_id: null, user_id: user.id })
      .select('*, alumna:alumnas(nombre)')
      .single()
    if (row) setMovimientos(prev => [row as MovRow, ...prev])
    setModal(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('movimientos_caja').delete().eq('id', id)
    setMovimientos(prev => prev.filter(m => m.id !== id))
    setConfirmDelete(null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Transferencias</h1>
            <p className="text-sm text-slate-400 mt-0.5">Control de dinero recibido por transferencia</p>
          </div>
          <button onClick={() => setModal(true)}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Agregar</span>
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="bg-blue-50 rounded-xl p-2.5 md:p-3 border border-blue-100">
            <div className="flex items-center gap-1 mb-0.5">
              <ArrowUpRight className="w-3 h-3 text-blue-500 flex-shrink-0" />
              <p className="text-[10px] md:text-xs text-blue-600 font-medium truncate">Entradas</p>
            </div>
            <p className="text-base md:text-xl font-bold text-blue-700 truncate">${totalEntradas.toLocaleString('es-MX')}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-2.5 md:p-3 border border-red-100">
            <div className="flex items-center gap-1 mb-0.5">
              <ArrowDownRight className="w-3 h-3 text-red-500 flex-shrink-0" />
              <p className="text-[10px] md:text-xs text-red-600 font-medium truncate">Salidas</p>
            </div>
            <p className="text-base md:text-xl font-bold text-red-600 truncate">${totalSalidas.toLocaleString('es-MX')}</p>
          </div>
          <div className={`rounded-xl p-2.5 md:p-3 border ${saldo >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-center gap-1 mb-0.5">
              <Wallet className="w-3 h-3 flex-shrink-0 text-emerald-500" />
              <p className={`text-[10px] md:text-xs font-medium truncate ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Saldo</p>
            </div>
            <p className={`text-base md:text-xl font-bold truncate ${saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${saldo.toLocaleString('es-MX')}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          {loading ? (
            <div className="text-center py-16 text-slate-400">Cargando...</div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-16">
              <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No hay movimientos por transferencia</p>
              <button onClick={() => setModal(true)} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
                + Agregar primer movimiento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Concepto</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Categoría</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Monto</th>
                    <th className="px-3 py-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map(m => (
                    <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 min-w-[160px]">
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
                                <User className="w-3 h-3 flex-shrink-0" />{m.alumna.nombre}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                          {m.categoria}
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 text-right font-semibold whitespace-nowrap ${m.tipo === 'ingreso' ? 'text-blue-600' : 'text-red-500'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}${Number(m.monto).toLocaleString('es-MX')}
                      </td>
                      <td className="px-3 py-3.5">
                        <button onClick={() => setConfirmDelete(m.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition text-slate-300 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add modal */}
      {modal && <TransferenciaModal onSave={handleAdd} onClose={() => setModal(false)} />}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-center font-semibold text-slate-900 mb-1">Eliminar registro</h3>
            <p className="text-center text-sm text-slate-400 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Transfer Modal ───────────────────────────────────────────────────────
function TransferenciaModal({ onSave, onClose }: {
  onSave: (d: { tipo: MovimientoTipo; concepto: string; monto: number; categoria: string; fecha: string }) => void
  onClose: () => void
}) {
  const [tipo,      setTipo]      = useState<MovimientoTipo>('ingreso')
  const [concepto,  setConcepto]  = useState('')
  const [monto,     setMonto]     = useState('')
  const [categoria, setCategoria] = useState('colegiatura')
  const [fecha,     setFecha]     = useState(new Date().toISOString().slice(0, 10))

  const CATS = [
    { key: 'inscripcion', label: 'Inscripción' },
    { key: 'colegiatura', label: 'Colegiatura' },
    { key: 'bachillerato', label: 'Bachillerato' },
    { key: 'ambos', label: 'Col. + Bachi' },
    { key: 'materiales', label: 'Materiales' },
    { key: 'otros', label: 'Otros' },
  ]

  const handleSubmit = () => {
    if (!concepto.trim() || !monto) return
    onSave({ tipo, concepto: concepto.trim(), monto: parseFloat(monto) || 0, categoria, fecha })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">Nuevo movimiento por transferencia</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setTipo('ingreso')}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'ingreso' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
              Ingreso
            </button>
            <button onClick={() => setTipo('egreso')}
              className={`py-2 rounded-lg text-sm font-medium transition ${tipo === 'egreso' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>
              Salida
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Colegiatura Mayo"
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {CATS.map(c => (
                <button key={c.key} onClick={() => setCategoria(c.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    categoria === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
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
