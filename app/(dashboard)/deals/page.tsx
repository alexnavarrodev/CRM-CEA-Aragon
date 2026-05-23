'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Deal, Contact, DEAL_STAGES } from '@/lib/types'
import DealModal from '@/components/DealModal'
import { Plus, Search, Briefcase, ArrowUpRight, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: dealsData }, { data: contactsData }] = await Promise.all([
        supabase.from('deals').select('*, contact:contacts(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('contacts').select('*').eq('user_id', user.id).order('name'),
      ])
      setDeals(dealsData ?? [])
      setContacts(contactsData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async (data: Partial<Deal>) => {
    if (editingDeal) {
      await supabase.from('deals').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingDeal.id)
      setDeals(prev => prev.map(d => d.id === editingDeal.id ? { ...d, ...data } : d))
    } else {
      const stage = DEAL_STAGES.find(s => s.id === data.stage)
      const { data: inserted } = await supabase.from('deals').insert({
        ...data,
        user_id: userId,
        probability: stage?.probability ?? 10,
        position: 0,
      }).select('*, contact:contacts(*)').single()
      if (inserted) setDeals(prev => [inserted, ...prev])
    }
    setModalOpen(false)
    setEditingDeal(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este negocio?')) return
    await supabase.from('deals').delete().eq('id', id)
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  const filtered = deals.filter(d => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.company?.toLowerCase().includes(search.toLowerCase()) ||
      (d as any).contact?.name?.toLowerCase().includes(search.toLowerCase())
    const matchStage = stageFilter === 'all' || d.stage === stageFilter
    return matchSearch && matchStage
  })

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Negocios</h1>
          <p className="text-slate-500 text-sm mt-0.5">{deals.length} negocios en total</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pipeline" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition shadow-sm">
            <ArrowUpRight className="w-4 h-4" />
            Ver Kanban
          </Link>
          <button
            onClick={() => { setEditingDeal(null); setModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition shadow-sm shadow-violet-200"
          >
            <Plus className="w-4 h-4" />
            Nuevo negocio
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white shadow-sm"
            placeholder="Buscar negocios..."
          />
        </div>
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white shadow-sm text-slate-700"
        >
          <option value="all">Todas las etapas</option>
          {DEAL_STAGES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Deals grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center">
          <Briefcase className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            {search || stageFilter !== 'all' ? 'No se encontraron negocios' : 'Aún no tienes negocios'}
          </p>
          {!search && stageFilter === 'all' && (
            <button
              onClick={() => { setEditingDeal(null); setModalOpen(true) }}
              className="mt-3 text-violet-600 text-sm font-medium hover:text-violet-700 flex items-center gap-1 mx-auto"
            >
              <Plus className="w-3.5 h-3.5" /> Crear primer negocio
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(deal => {
            const stage = DEAL_STAGES.find(s => s.id === deal.stage)
            return (
              <div key={deal.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-semibold text-slate-800 truncate">{deal.title}</p>
                    {(deal.company || (deal as any).contact?.company) && (
                      <p className="text-xs text-slate-400 mt-0.5">{deal.company || (deal as any).contact?.company}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${stage?.bg} ${stage?.color}`}>
                    {stage?.label}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xl font-bold text-slate-800">${Number(deal.value).toLocaleString('es-MX')}</p>
                    {deal.expected_close_date && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cierre: {format(new Date(deal.expected_close_date), 'dd MMM yyyy', { locale: es })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => { setEditingDeal(deal); setModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                      <Pencil className="w-4 h-4 text-slate-400 hover:text-violet-600" />
                    </button>
                    <button onClick={() => handleDelete(deal.id)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                      <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Probabilidad</span>
                    <span className={`text-xs font-medium ${stage?.color}`}>{deal.probability}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        deal.stage === 'closed_won' ? 'bg-emerald-400' :
                        deal.stage === 'closed_lost' ? 'bg-red-400' : 'bg-violet-400'
                      }`}
                      style={{ width: `${deal.probability}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <DealModal
          deal={editingDeal}
          defaultStage="lead"
          contacts={contacts}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingDeal(null) }}
        />
      )}
    </div>
  )
}
