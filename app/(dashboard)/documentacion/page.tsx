'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Grupo, DIA_COLORS } from '@/lib/types'
import { Plus, X, Trash2, Check, ClipboardCheck } from 'lucide-react'

// ─── Documentos (mismas columnas que la hoja) ────────────────────────────────
const DOCS = [
  { key: 'curp',            label: 'CURP' },
  { key: 'ine',             label: 'INE' },
  { key: 'firma',           label: 'FIRMA' },
  { key: 'estudios',        label: 'ESTUDIOS' },
  { key: 'acta_nacimiento', label: 'A.NACIMIENTO' },
  { key: 'fotos',           label: '2 FOTOS' },
] as const

type DocKey = typeof DOCS[number]['key']

interface DocRow {
  id: string
  nombre: string
  grupo_id: string | null
  curp: boolean
  ine: boolean
  firma: boolean
  estudios: boolean
  acta_nacimiento: boolean
  fotos: boolean
  grupo?: Grupo | null
}

const estaCompleta = (r: DocRow) => DOCS.every(d => r[d.key])

export default function DocumentacionPage() {
  const [rows, setRows] = useState<DocRow[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: docs }, { data: gr }] = await Promise.all([
      supabase.from('documentacion_bachillerato').select('*, grupo:grupos(*)')
        .eq('user_id', user.id).order('nombre'),
      supabase.from('grupos').select('*').eq('user_id', user.id).order('dia'),
    ])
    setRows((docs ?? []) as DocRow[])
    setGrupos(gr ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Marcar / desmarcar un documento (optimista)
  const toggle = async (row: DocRow, key: DocKey) => {
    const nuevo = !row[key]
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, [key]: nuevo } : r))
    await supabase.from('documentacion_bachillerato').update({ [key]: nuevo }).eq('id', row.id)
  }

  const handleAdd = async (nombre: string, grupoId: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('documentacion_bachillerato')
      .insert({ user_id: user.id, nombre, grupo_id: grupoId })
      .select('*, grupo:grupos(*)').single()
    if (data) setRows(prev => [...prev, data as DocRow].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setModal(false)
  }

  const handleDelete = async (row: DocRow) => {
    if (!confirm(`¿Eliminar a "${row.nombre}" de la documentación?`)) return
    await supabase.from('documentacion_bachillerato').delete().eq('id', row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  const completas = rows.filter(estaCompleta).length

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 md:px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Documentación Bachillerato</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {loading ? 'Cargando…' : `${rows.length} alumnas · ${completas} con documentación completa`}
            </p>
          </div>
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> Agregar alumna
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
            <ClipboardCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm mb-2">No hay alumnas registradas</p>
            <button onClick={() => setModal(true)} className="text-blue-600 text-sm font-medium hover:underline">
              + Agregar la primera
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left font-semibold text-slate-600 px-4 py-3 sticky left-0 bg-slate-50 z-10">NOMBRE</th>
                    <th className="text-left font-semibold text-slate-600 px-4 py-3">GRUPO</th>
                    {DOCS.map(d => (
                      <th key={d.key} className="text-center font-semibold text-slate-600 px-3 py-3 whitespace-nowrap">{d.label}</th>
                    ))}
                    <th className="px-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const completa = estaCompleta(row)
                    const c = row.grupo ? (DIA_COLORS[row.grupo.dia] || { bg: '#94A3B8', text: '#fff' }) : null
                    return (
                      <tr key={row.id} className={`border-b border-slate-100 transition ${completa ? 'bg-green-500' : 'hover:bg-slate-50'}`}>
                        <td className={`px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10 ${completa ? 'bg-green-500 text-white' : 'bg-white text-slate-800'}`}>
                          {row.nombre}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {row.grupo && c ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.bg }}>{row.grupo.dia}</span>
                              <span className={completa ? 'text-white' : 'text-slate-600'}>{row.grupo.nombre}</span>
                            </span>
                          ) : (
                            <span className={completa ? 'text-white/70' : 'text-slate-300'}>—</span>
                          )}
                        </td>
                        {DOCS.map(d => {
                          const val = row[d.key]
                          return (
                            <td key={d.key} className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => toggle(row, d.key)}
                                title={d.label}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded border-2 transition ${
                                  val
                                    ? 'bg-emerald-600 border-emerald-700 text-white'
                                    : completa
                                      ? 'bg-white/30 border-white/60'
                                      : 'bg-white border-slate-300 hover:border-blue-400'
                                }`}
                              >
                                {val && <Check className="w-4 h-4" strokeWidth={3} />}
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-2">
                          <button
                            onClick={() => handleDelete(row)}
                            className={`p-1.5 rounded-lg transition ${completa ? 'text-white/70 hover:text-white hover:bg-white/20' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <AddModal grupos={grupos} onAdd={handleAdd} onClose={() => setModal(false)} />
      )}
    </div>
  )
}

// ─── Modal: agregar alumna con su grupo ──────────────────────────────────────
function AddModal({ grupos, onAdd, onClose }: {
  grupos: Grupo[]
  onAdd: (nombre: string, grupoId: string | null) => void
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [grupoId, setGrupoId] = useState<string>('')

  const submit = () => {
    if (!nombre.trim()) return
    onAdd(nombre.trim(), grupoId || null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Agregar alumna</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
            <input
              value={nombre}
              autoFocus
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="Nombre de la alumna"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Grupo</label>
            <select
              value={grupoId}
              onChange={e => setGrupoId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Sin grupo</option>
              {grupos.map(g => (
                <option key={g.id} value={g.id}>{g.dia} · {g.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button onClick={submit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
