'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Minus, Trash2, X, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface WalletEntry {
  id: string
  concepto: string
  monto: number        // positivo = entrada, negativo = salida
  fecha: string
  created_at: string
}

type ModalMode = 'add' | 'subtract'

// ─── Supabase user_metadata helpers ──────────────────────────────────────────
// Guardamos las entradas en user_metadata.wallet_entries (no requiere nueva tabla)

async function loadFromSupabase(supabase: ReturnType<typeof createClient>): Promise<WalletEntry[]> {
  const { data: { user } } = await supabase.auth.getUser()
  const raw = user?.user_metadata?.wallet_entries
  if (!raw || !Array.isArray(raw)) return []
  return raw as WalletEntry[]
}

async function saveToSupabase(supabase: ReturnType<typeof createClient>, entries: WalletEntry[]) {
  await supabase.auth.updateUser({ data: { wallet_entries: entries } })
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TransferenciasPage() {
  const [entries, setEntries]               = useState<WalletEntry[]>([])
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [modal, setModal]                   = useState<ModalMode | null>(null)
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null)
  const supabase = createClient()

  const saldo = entries.reduce((s, e) => s + Number(e.monto), 0)

  const load = useCallback(async () => {
    const data = await loadFromSupabase(supabase)
    // Ordenar por fecha desc, luego por created_at desc
    data.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
    setEntries(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const persist = async (newEntries: WalletEntry[]) => {
    setSaving(true)
    await saveToSupabase(supabase, newEntries)
    setSaving(false)
  }

  const handleAdd = async (concepto: string, monto: number, fecha: string, mode: ModalMode) => {
    const montoFinal = mode === 'subtract' ? -Math.abs(monto) : Math.abs(monto)
    const newEntry: WalletEntry = {
      id: crypto.randomUUID(),
      concepto,
      monto: montoFinal,
      fecha,
      created_at: new Date().toISOString(),
    }
    const newEntries = [newEntry, ...entries].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at)
    )
    setEntries(newEntries)
    setModal(null)
    await persist(newEntries)
  }

  const handleDelete = async (id: string) => {
    const newEntries = entries.filter(e => e.id !== id)
    setEntries(newEntries)
    setConfirmDelete(null)
    await persist(newEntries)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Transferencias</h1>
            <p className="text-sm text-slate-400 mt-0.5">Control interno — independiente de Caja</p>
          </div>
          {saving && <span className="text-xs text-slate-400 animate-pulse">Guardando…</span>}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">

        {/* Balance card */}
        <div className={`rounded-2xl p-6 flex flex-col items-center justify-center gap-2 shadow-sm border ${
          saldo >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${saldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            Saldo disponible en transferencias
          </p>
          <p className={`text-4xl md:text-5xl font-bold tabular-nums ${saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {loading ? '···' : fmt(saldo)}
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setModal('add')}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition text-white font-semibold text-base shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Agregar
          </button>
          <button
            onClick={() => setModal('subtract')}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-white font-semibold text-base shadow-sm"
          >
            <Minus className="w-5 h-5" />
            Descontar
          </button>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-semibold text-slate-700">Movimientos</h2>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Cargando...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">Aún no hay movimientos</p>
              <button onClick={() => setModal('add')} className="mt-2 text-blue-600 text-sm font-medium hover:underline">
                + Primer ingreso
              </button>
            </div>
          ) : (
            <ul>
              {entries.map((e, i) => (
                <li key={e.id}
                  className={`flex items-center gap-3 px-5 py-3.5 group transition hover:bg-slate-50/60 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${e.monto >= 0 ? 'bg-blue-50' : 'bg-slate-100'}`}>
                    {e.monto >= 0
                      ? <ArrowUpRight className="w-4 h-4 text-blue-500" />
                      : <ArrowDownRight className="w-4 h-4 text-slate-500" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{e.concepto}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-MX', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className={`font-bold text-base tabular-nums flex-shrink-0 ${e.monto >= 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                    {e.monto >= 0 ? '+' : ''}{fmt(e.monto)}
                  </span>
                  <button
                    onClick={() => setConfirmDelete(e.id)}
                    className="p-1.5 rounded-lg text-slate-200 hover:text-red-400 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {modal && (
        <EntryModal
          mode={modal}
          onSave={(concepto, monto, fecha) => handleAdd(concepto, monto, fecha, modal)}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-center font-semibold text-slate-900 mb-1">Eliminar movimiento</h3>
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

// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ mode, onSave, onClose }: {
  mode: ModalMode
  onSave: (concepto: string, monto: number, fecha: string) => void
  onClose: () => void
}) {
  const isAdd = mode === 'add'
  const [concepto, setConcepto] = useState(isAdd ? '' : 'Sueldos semanal')
  const [monto, setMonto]       = useState('')
  const [fecha, setFecha]       = useState(new Date().toISOString().slice(0, 10))

  const handleSubmit = () => {
    const m = parseFloat(monto.replace(',', '.')) || 0
    if (!concepto.trim() || !m) return
    onSave(concepto.trim(), m, fecha)
  }

  const PRESETS_ADD = ['Transferencia recibida', 'Colegiatura', 'Bachillerato', 'Inscripción', 'Otros']
  const PRESETS_SUB = ['Sueldos semanal', 'Sueldo Alex', 'Sueldo ayudante', 'Renta', 'Servicios', 'Materiales']

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm mx-0 sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${isAdd ? 'bg-blue-100' : 'bg-slate-100'}`}>
              {isAdd ? <Plus className="w-4 h-4 text-blue-600" /> : <Minus className="w-4 h-4 text-slate-600" />}
            </span>
            <h3 className="font-semibold text-slate-900">
              {isAdd ? 'Agregar dinero' : 'Descontar dinero'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Monto — grande */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Monto</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl font-medium">$</span>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                value={monto}
                onChange={e => setMonto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="0"
                className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 rounded-2xl text-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Concepto */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Concepto</label>
            <input
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder="Descripción"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(isAdd ? PRESETS_ADD : PRESETS_SUB).map(p => (
                <button key={p} onClick={() => setConcepto(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                    concepto === p ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!monto || !concepto.trim()}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-base transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              isAdd ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {isAdd ? '+ Agregar al saldo' : '− Descontar del saldo'}
          </button>
        </div>
      </div>
    </div>
  )
}
