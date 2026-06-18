'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alumna, MovimientoCaja, MovimientoTipo, Canal, MESES } from '@/lib/types'
import { mesToBachiTipo, planColegiatura, planBachillerato } from '@/lib/acumulacion'
import { EXTRA_TARGET } from '@/lib/extras'
import {
  Plus, TrendingUp, TrendingDown, X, ArrowUpRight, ArrowDownRight,
  User, Trash2, Pencil, ChevronDown, ChevronUp, Tag, Check,
} from 'lucide-react'

// ─── Category helpers ────────────────────────────────────────────────────────
export const PROTECTED_CATS = ['inscripcion', 'colegiatura', 'bachillerato', 'ambos', 'otros']

export const DEFAULT_CATEGORIAS: { key: string; label: string }[] = [
  { key: 'inscripcion',   label: 'Inscripción' },
  { key: 'colegiatura',   label: 'Colegiatura' },  // singular — no 'Colegiaturas'
  { key: 'bachillerato',  label: 'Bachillerato' },
  { key: 'ambos',         label: 'Col. + Bachi' },
  { key: 'materiales',    label: 'Materiales' },
  { key: 'renta',         label: 'Renta' },
  { key: 'sueldos',       label: 'Sueldos' },
  { key: 'servicios',     label: 'Servicios' },
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'uniforme',      label: 'Uniforme' },
  { key: 'certificado',   label: 'Certificado' },
  { key: 'otros',         label: 'Otros' },
]

function loadCategorias(): { key: string; label: string }[] {
  try {
    const stored = localStorage.getItem('crm_categorias')
    if (stored) return JSON.parse(stored) as { key: string; label: string }[]
  } catch {}
  return DEFAULT_CATEGORIAS
}

function saveCatStorage(cats: { key: string; label: string }[]) {
  try { localStorage.setItem('crm_categorias', JSON.stringify(cats)) } catch {}
}

// ─── Labels ──────────────────────────────────────────────────────────────────
const CANAL_LABELS: Record<Canal, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta',
}

const BACHI_CONCEPTOS = [
  { key: 'inscripcion', label: 'Inscripción' },
  { key: 'materiales',  label: 'Materiales' },
  ...MESES.map(m => ({ key: m.toLowerCase(), label: m })),
]

// (mesToBachiTipo y las secuencias de meses ahora viven en lib/acumulacion.ts)

// ─── Types ───────────────────────────────────────────────────────────────────
type MovRow = MovimientoCaja & { alumna?: { nombre: string } | null }

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CajaPage() {
  const [movimientos, setMovimientos]   = useState<MovRow[]>([])
  const [filtroTipo, setFiltroTipo]     = useState<'todos' | MovimientoTipo>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroMes, setFiltroMes]       = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [busqueda, setBusqueda]         = useState('')
  const [headerOpen, setHeaderOpen]     = useState(true)
  const [modal, setModal]               = useState(false)
  const [editModal, setEditModal]       = useState<MovRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [catModal, setCatModal]         = useState(false)
  const [loading, setLoading]           = useState(true)
  const [categorias, setCategorias]     = useState<{ key: string; label: string }[]>(DEFAULT_CATEGORIAS)
  const supabase = createClient()

  useEffect(() => { setCategorias(loadCategorias()) }, [])

  const saveCategorias = useCallback((cats: { key: string; label: string }[]) => {
    setCategorias(cats)
    saveCatStorage(cats)
  }, [])

  const catLabel = useCallback((key: string) =>
    categorias.find(c => c.key === key)?.label ?? key
  , [categorias])

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
    if (filtroCategoria !== 'todos' && m.categoria !== filtroCategoria) return false
    if (filtroMes) {
      // Comparación directa de string 'YYYY-MM' — evita problema UTC con new Date('YYYY-MM-DD')
      if (m.fecha.slice(0, 7) !== filtroMes) return false
    }
    if (busqueda && !m.concepto.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const totalIngresos = filtrados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const totalGastos   = filtrados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  // Margen excluye bachillerato completo y la mitad de 'ambos' (Col.+Bachi)
  const ingresosMargen = filtrados
    .filter(m => m.tipo === 'ingreso' && m.categoria !== 'bachillerato')
    .reduce((s, m) => {
      if (m.categoria === 'ambos') return s + Number(m.monto) / 2  // solo la parte de colegiatura
      return s + Number(m.monto)
    }, 0)
  const balance = ingresosMargen - totalGastos

  // ── Save new movement ─────────────────────────────────────────────────────
  const handleAdd = async (payload: {
    tipo: MovimientoTipo; concepto: string; monto: number
    canal: Canal; categoria: string; fecha: string
    alumna_id: string | null; mes: number; tipoBachi: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { alumna_id, mes, tipoBachi, ...movData } = payload
    const anio = new Date(payload.fecha).getFullYear()

    const { data: row } = await supabase
      .from('movimientos_caja')
      .insert({ ...movData, alumna_id: alumna_id || null, user_id: user.id })
      .select('*, alumna:alumnas(nombre)')
      .single()
    if (row) setMovimientos(prev => [row as MovRow, ...prev])

    // Límite de colegiatura: 1000 para 'ambos', cuota real para colegiatura pura
    let colLimit = 1000
    if (alumna_id) {
      const { data: al } = await supabase
        .from('alumnas').select('programa, cuota_mensual').eq('id', alumna_id).maybeSingle()
      if (al) colLimit = al.programa === 'ambos' ? 1000 : Number(al.cuota_mensual) || 1000
    }

    // ── Acumula un pago de colegiatura (usa el planificador puro de lib/acumulacion) ──
    const upsertCol = async (montoCol: number) => {
      if (!alumna_id || !mes || montoCol <= 0) return
      const { data: existing } = await supabase
        .from('pagos_colegiaturas').select('id, anio, mes, monto, estado')
        .eq('alumna_id', alumna_id)
      const plan = planColegiatura(existing ?? [], montoCol, anio, mes, colLimit)
      for (const w of plan) {
        if (w.id) {
          await supabase.from('pagos_colegiaturas')
            .update({ monto: w.monto, estado: w.estado, fecha_pago: payload.fecha }).eq('id', w.id)
        } else {
          await supabase.from('pagos_colegiaturas').insert({
            user_id: user.id, alumna_id, anio: w.anio, mes: w.mes,
            monto: w.monto, estado: w.estado, fecha_pago: payload.fecha,
          })
        }
      }
    }

    // ── Acumula un pago de bachillerato (límite 1000 por mes) ────────────────────
    const upsertBachi = async (montoBachi: number, startTipo: string) => {
      if (!alumna_id || !startTipo || montoBachi <= 0) return
      const { data: existing } = await supabase
        .from('pagos_bachillerato').select('id, anio, tipo, monto, estado')
        .eq('alumna_id', alumna_id)
      const plan = planBachillerato(existing ?? [], montoBachi, anio, startTipo, 1000)
      for (const w of plan) {
        if (w.id) {
          await supabase.from('pagos_bachillerato')
            .update({ monto: w.monto, estado: w.estado, fecha_pago: payload.fecha }).eq('id', w.id)
        } else {
          await supabase.from('pagos_bachillerato').insert({
            user_id: user.id, alumna_id, anio: w.anio, tipo: w.tipo,
            monto: w.monto, estado: w.estado, fecha_pago: payload.fecha,
          })
        }
      }
    }

    // Acumula uniforme/certificado en pagos_extras (tope en su target)
    const upsertExtra = async (concepto: 'uniforme' | 'certificado', montoPago: number) => {
      if (!alumna_id || montoPago <= 0) return
      const target = EXTRA_TARGET[concepto]
      const { data: ex } = await supabase
        .from('pagos_extras').select('id, monto')
        .eq('alumna_id', alumna_id).eq('concepto', concepto).maybeSingle()
      const nuevo = Math.min(target, (ex ? Number(ex.monto) : 0) + montoPago)
      const estado = nuevo >= target ? 'pagado' : 'parcial'
      if (ex) {
        await supabase.from('pagos_extras')
          .update({ monto: nuevo, estado, fecha_pago: payload.fecha }).eq('id', ex.id)
      } else {
        await supabase.from('pagos_extras').insert({
          user_id: user.id, alumna_id, concepto, monto: nuevo, estado, fecha_pago: payload.fecha,
        })
      }
    }

    if (alumna_id && payload.tipo === 'ingreso') {
      if (payload.categoria === 'colegiatura') await upsertCol(payload.monto)
      if (payload.categoria === 'bachillerato') await upsertBachi(payload.monto, tipoBachi)
      if (payload.categoria === 'ambos') {
        const mitad = payload.monto / 2
        await upsertCol(mitad)
        await upsertBachi(mitad, mesToBachiTipo(mes))
      }
      if (payload.categoria === 'uniforme') await upsertExtra('uniforme', payload.monto)
      if (payload.categoria === 'certificado') await upsertExtra('certificado', payload.monto)
    }
    setModal(false)
  }

  const handleUpdate = async (id: string, changes: {
    tipo: MovimientoTipo; concepto: string; monto: number
    canal: string; categoria: string; fecha: string
  }) => {
    const { data: row } = await supabase
      .from('movimientos_caja')
      .update(changes).eq('id', id)
      .select('*, alumna:alumnas(nombre)').single()
    if (row) setMovimientos(prev => prev.map(m => m.id === id ? row as MovRow : m))
    setEditModal(null)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('movimientos_caja').delete().eq('id', id)
    setMovimientos(prev => prev.filter(m => m.id !== id))
    setConfirmDelete(null)
  }

  const mesesOpciones = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    return { key, label }
  })

  // Categories used in current movimientos (all time) for "in use" detection
  const catsEnUso = [...new Set(movimientos.map(m => m.categoria))]

  const catBadgeColor = (cat: string) =>
    cat === 'ambos'       ? 'bg-violet-50 text-violet-700' :
    cat === 'colegiatura' ? 'bg-blue-50 text-blue-700' :
    cat === 'bachillerato'? 'bg-emerald-50 text-emerald-700' :
    cat === 'renta' || cat === 'sueldos' || cat === 'servicios' || cat === 'mantenimiento'
                          ? 'bg-orange-50 text-orange-700' :
                            'bg-slate-100 text-slate-600'

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHeaderOpen(o => !o)}
              className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400"
              title={headerOpen ? 'Colapsar' : 'Expandir'}
            >
              {headerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Caja</h1>
              {headerOpen && <p className="text-xs text-slate-400">Control de ingresos y gastos</p>}
            </div>
          </div>
          <button onClick={() => setModal(true)}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo movimiento</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>

        {headerOpen && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3">
              <div className="bg-blue-50 rounded-xl p-2.5 md:p-3 border border-blue-100">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingUp className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  <p className="text-[10px] md:text-xs text-blue-600 font-medium truncate">Ingresos</p>
                </div>
                <p className="text-base md:text-xl font-bold text-blue-700 truncate">${totalIngresos.toLocaleString('es-MX')}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-2.5 md:p-3 border border-red-100">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />
                  <p className="text-[10px] md:text-xs text-red-600 font-medium truncate">Gastos</p>
                </div>
                <p className="text-base md:text-xl font-bold text-red-600 truncate">${totalGastos.toLocaleString('es-MX')}</p>
              </div>
              <div className={`rounded-xl p-2.5 md:p-3 border ${balance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <p className={`text-[10px] md:text-xs font-medium mb-0.5 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Margen <span className="font-normal opacity-60">(sin Bachi)</span>
                </p>
                <p className={`text-base md:text-xl font-bold truncate ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${balance.toLocaleString('es-MX')}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {mesesOpciones.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>

              {/* Tipo */}
              <div className="flex items-center gap-1">
                {(['todos', 'ingreso', 'egreso'] as const).map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filtroTipo === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    {t === 'todos' ? 'Todos' : t === 'ingreso' ? 'Ingresos' : 'Gastos'}
                  </button>
                ))}
              </div>

              {/* Categoria filter */}
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="todos">Todas las categorías</option>
                {categorias.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>

              {/* Manage categories */}
              <button
                onClick={() => setCatModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:border-slate-300 hover:bg-slate-50 transition"
                title="Gestionar categorías"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Categorías</span>
              </button>

              {/* Search */}
              <div className="relative flex-1 min-w-[140px]">
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar concepto..."
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full" />
                <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Concepto / Alumna</th>
                    <th className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Categoría</th>
                    <th className="text-left px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Canal</th>
                    <th className="text-right px-4 md:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Monto</th>
                    <th className="px-3 py-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(m => (
                    <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-4 md:px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 md:px-5 py-3.5 min-w-[180px]">
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
                      <td className="px-4 md:px-5 py-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${catBadgeColor(m.categoria)}`}>
                          {catLabel(m.categoria)}
                        </span>
                      </td>
                      <td className="px-4 md:px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                        {CANAL_LABELS[m.canal as Canal] ?? m.canal}
                      </td>
                      <td className={`px-4 md:px-5 py-3.5 text-right font-semibold whitespace-nowrap ${m.tipo === 'ingreso' ? 'text-blue-600' : 'text-red-500'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}${Number(m.monto).toLocaleString('es-MX')}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditModal(m)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition text-slate-300 hover:text-blue-500" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete(m.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition text-slate-300 hover:text-red-400" title="Eliminar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {modal && (
        <MovimientoModal
          categorias={categorias}
          onSave={handleAdd}
          onClose={() => setModal(false)}
        />
      )}
      {editModal && (
        <EditModal
          movimiento={editModal}
          categorias={categorias}
          onSave={(changes) => handleUpdate(editModal.id, changes)}
          onClose={() => setEditModal(null)}
        />
      )}
      {catModal && (
        <CategoriaModal
          categorias={categorias}
          catsEnUso={catsEnUso}
          onSave={saveCategorias}
          onClose={() => setCatModal(false)}
        />
      )}

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

// ─── Category Management Modal ────────────────────────────────────────────────
function CategoriaModal({ categorias, catsEnUso, onSave, onClose }: {
  categorias: { key: string; label: string }[]
  catsEnUso: string[]
  onSave: (cats: { key: string; label: string }[]) => void
  onClose: () => void
}) {
  const [cats, setCats]         = useState(categorias)
  const [editKey, setEditKey]   = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [delConfirm, setDelConfirm] = useState<string | null>(null)

  const startEdit = (key: string, label: string) => {
    setEditKey(key)
    setEditLabel(label)
  }

  const confirmEdit = (key: string) => {
    if (!editLabel.trim()) return
    setCats(prev => prev.map(c => c.key === key ? { ...c, label: editLabel.trim() } : c))
    setEditKey(null)
  }

  const deletecat = (key: string) => {
    setCats(prev => prev.filter(c => c.key !== key))
    setDelConfirm(null)
  }

  const addCat = () => {
    const l = newLabel.trim()
    if (!l) return
    // Clave auto-generada desde el nombre (sin acentos, minúsculas, guion bajo)
    const k = l.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!k) return
    if (cats.some(c => c.key === k)) { setNewLabel(''); return } // ya existe
    setCats(prev => [...prev, { key: k, label: l }])
    setNewLabel('')
  }

  const handleSave = () => {
    onSave(cats)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Gestionar categorías</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
          {cats.map(c => {
            const isProtected = PROTECTED_CATS.includes(c.key)
            const isInUse     = catsEnUso.includes(c.key)
            const isEditing   = editKey === c.key

            return (
              <div key={c.key} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 group">
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(c.key); if (e.key === 'Escape') setEditKey(null) }}
                      className="flex-1 px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={() => confirmEdit(c.key)}
                      className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditKey(null)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-slate-700">{c.label}</span>
                    <span className="text-[10px] text-slate-300 font-mono mr-1">{c.key}</span>
                    {isInUse && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mr-1">en uso</span>
                    )}
                    <button onClick={() => startEdit(c.key, c.label)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    {!isProtected ? (
                      delConfirm === c.key ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600">¿Borrar?</span>
                          <button onClick={() => deletecat(c.key)}
                            className="p-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDelConfirm(null)}
                            className="p-1 hover:bg-slate-200 rounded-lg transition">
                            <X className="w-3 h-3 text-slate-400" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDelConfirm(c.key)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title={isInUse ? 'Esta categoría tiene movimientos' : 'Eliminar'}>
                          <Trash2 className={`w-3.5 h-3.5 ${isInUse ? 'text-slate-300' : 'text-red-400'}`} />
                        </button>
                      )
                    ) : (
                      <span className="w-8 flex-shrink-0" />
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Add new */}
        <div className="px-5 pb-4 border-t border-slate-100 pt-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Nueva categoría</p>
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Nombre (ej: Certificado)"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={e => { if (e.key === 'Enter') addCat() }}
            />
            <button onClick={addCat}
              className="px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition flex-shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={handleSave}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ movimiento, categorias, onSave, onClose }: {
  movimiento: MovRow
  categorias: { key: string; label: string }[]
  onSave: (changes: { tipo: MovimientoTipo; concepto: string; monto: number; canal: string; categoria: string; fecha: string }) => void
  onClose: () => void
}) {
  const [tipo,      setTipo]      = useState<MovimientoTipo>(movimiento.tipo)
  const [concepto,  setConcepto]  = useState(movimiento.concepto)
  const [monto,     setMonto]     = useState(String(movimiento.monto))
  const [canal,     setCanal]     = useState<string>(movimiento.canal)
  const [categoria, setCategoria] = useState(movimiento.categoria)
  const [fecha,     setFecha]     = useState(movimiento.fecha)

  const handleSubmit = () => {
    if (!concepto.trim() || !monto) return
    onSave({ tipo, concepto: concepto.trim(), monto: parseFloat(monto) || 0, canal, categoria, fecha })
  }

  const CANALES = [
    { key: 'efectivo', label: 'Efectivo' }, { key: 'transferencia', label: 'Transferencia' },
    { key: 'tarjeta', label: 'Tarjeta' }, { key: 'mixto', label: 'Mixto' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold text-slate-900">Editar movimiento</h3>
            {movimiento.alumna && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" />{movimiento.alumna.nombre}
              </p>
            )}
          </div>
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
              Gasto
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {categorias.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal de pago</label>
            <div className="grid grid-cols-4 gap-2">
              {CANALES.map(c => (
                <button key={c.key} onClick={() => setCanal(c.key)}
                  className={`py-2 rounded-xl text-xs font-medium border transition ${canal === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── New Movement Modal ───────────────────────────────────────────────────────
function MovimientoModal({ categorias, onSave, onClose }: {
  categorias: { key: string; label: string }[]
  onSave: (d: {
    tipo: MovimientoTipo; concepto: string; monto: number
    canal: Canal; categoria: string; fecha: string
    alumna_id: string | null; mes: number; tipoBachi: string
  }) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [alumnas, setAlumnas]     = useState<Alumna[]>([])
  const [alumnaId, setAlumnaId]   = useState<string>('')
  const [tipo, setTipo]           = useState<MovimientoTipo>('ingreso')
  const [categoria, setCategoria] = useState('colegiatura')
  const [mes, setMes]             = useState(new Date().getMonth() + 1)
  const [tipoBachi, setTipoBachi] = useState(MESES[new Date().getMonth()].toLowerCase())
  const [concepto, setConcepto]   = useState('')
  const [monto, setMonto]         = useState('')
  const [canal, setCanal]         = useState<Canal>('efectivo')
  const [fecha, setFecha]         = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('alumnas').select('*').eq('user_id', user.id).eq('status', 'activa').order('nombre')
        .then(({ data }) => setAlumnas(data ?? []))
    })
  }, [])

  const alumna   = alumnas.find(a => a.id === alumnaId)
  const programa = alumna?.programa ?? null

  const categoriasDisponibles: { key: string; label: string }[] = (() => {
    // Categorías "extra" (no col/bachi) + asegura uniforme y certificado siempre
    const otras = () => {
      const filt = categorias.filter(c => !['inscripcion','colegiatura','bachillerato','ambos'].includes(c.key))
      for (const e of [{ key: 'uniforme', label: 'Uniforme' }, { key: 'certificado', label: 'Certificado' }])
        if (!filt.some(c => c.key === e.key)) filt.push(e)
      return filt
    }
    if (tipo === 'egreso') return categorias.filter(c =>
      !['inscripcion','colegiatura','bachillerato','ambos'].includes(c.key)
    )
    if (!alumna) return categorias
    if (programa === 'colegiaturas')  return [{ key: 'colegiatura', label: 'Colegiatura' }, ...otras()]
    if (programa === 'bachillerato') return [{ key: 'bachillerato', label: 'Bachillerato' }, ...otras()]
    if (programa === 'ambos')        return [
      { key: 'ambos', label: 'Col. + Bachi ($÷2)' },
      { key: 'colegiatura', label: 'Solo Colegiatura' },
      { key: 'bachillerato', label: 'Solo Bachillerato' },
      ...otras(),
    ]
    return categorias
  })()

  useEffect(() => {
    const primera = categoriasDisponibles[0]?.key ?? 'otros'
    setCategoria(primera)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnaId, tipo])

  const showMes      = tipo === 'ingreso' && (categoria === 'colegiatura' || categoria === 'ambos')
  const showBachiCol = tipo === 'ingreso' && categoria === 'bachillerato'
  const isAmbos      = categoria === 'ambos'
  const montoNum     = parseFloat(monto) || 0

  useEffect(() => {
    if (!alumna) return
    const mesLabel = MESES[mes - 1]
    if (categoria === 'colegiatura') setConcepto(`Colegiatura ${alumna.nombre} — ${mesLabel}`)
    if (categoria === 'bachillerato') {
      const bc = BACHI_CONCEPTOS.find(b => b.key === tipoBachi)
      setConcepto(`Bachillerato ${alumna.nombre} — ${bc?.label ?? tipoBachi}`)
    }
    if (categoria === 'ambos') setConcepto(`Col.+Bachi ${alumna.nombre} — ${mesLabel}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumna?.id, categoria, mes, tipoBachi])

  const handleSubmit = () => {
    if (!concepto.trim() || !monto) return
    onSave({ tipo, concepto: concepto.trim(), monto: montoNum, canal, categoria, fecha, alumna_id: alumnaId || null, mes, tipoBachi })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">Nuevo movimiento</h3>
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
              Gasto
            </button>
          </div>

          {tipo === 'ingreso' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Alumna</label>
              <select value={alumnaId} onChange={e => setAlumnaId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— Sin alumna / otro concepto —</option>
                {alumnas.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}{a.programa === 'ambos' ? ' ★' : ''}</option>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {categoriasDisponibles.map(c => (
                <button key={c.key} onClick={() => setCategoria(c.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    categoria === c.key
                      ? c.key === 'ambos'        ? 'bg-violet-600 text-white border-violet-600'
                      : c.key === 'colegiatura'  ? 'bg-blue-600 text-white border-blue-600'
                      : c.key === 'bachillerato' ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

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

          {showBachiCol && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto bachillerato</label>
              <select value={tipoBachi} onChange={e => setTipoBachi(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {BACHI_CONCEPTOS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)}
              placeholder="Descripción del movimiento"
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

          {isAmbos && montoNum > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm">
              <p className="text-violet-700 font-medium mb-1.5">División automática</p>
              <div className="flex justify-between text-violet-600 text-xs">
                <span>Colegiatura ({MESES[mes - 1]})</span>
                <span className="font-semibold">${(montoNum / 2).toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between text-violet-600 text-xs mt-1">
                <span>Bachillerato ({MESES[mes - 1]})</span>
                <span className="font-semibold">${(montoNum / 2).toLocaleString('es-MX')}</span>
              </div>
            </div>
          )}

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
