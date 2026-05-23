'use client'

import { useState, useEffect } from 'react'
import { Deal, Contact, DEAL_STAGES } from '@/lib/types'
import { X } from 'lucide-react'

interface DealModalProps {
  deal: Deal | null
  defaultStage: string
  contacts: Contact[]
  onSave: (data: Partial<Deal>) => void
  onClose: () => void
}

export default function DealModal({ deal, defaultStage, contacts, onSave, onClose }: DealModalProps) {
  const [form, setForm] = useState({
    title: '',
    value: '',
    stage: defaultStage,
    company: '',
    description: '',
    expected_close_date: '',
    contact_id: '',
    probability: DEAL_STAGES.find(s => s.id === defaultStage)?.probability?.toString() ?? '10',
  })

  useEffect(() => {
    if (deal) {
      setForm({
        title: deal.title,
        value: deal.value?.toString() ?? '',
        stage: deal.stage,
        company: deal.company ?? '',
        description: deal.description ?? '',
        expected_close_date: deal.expected_close_date ?? '',
        contact_id: deal.contact_id ?? '',
        probability: deal.probability?.toString() ?? '10',
      })
    }
  }, [deal])

  const handleStageChange = (stage: string) => {
    const prob = DEAL_STAGES.find(s => s.id === stage)?.probability?.toString() ?? form.probability
    setForm(f => ({ ...f, stage, probability: prob }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title: form.title,
      value: parseFloat(form.value) || 0,
      stage: form.stage as Deal['stage'],
      company: form.company || null,
      description: form.description || null,
      expected_close_date: form.expected_close_date || null,
      contact_id: form.contact_id || null,
      probability: parseInt(form.probability) || 0,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-lg">
            {deal ? 'Editar negocio' : 'Nuevo negocio'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Ej. Propuesta comercial ABC"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor ($)</label>
              <input
                type="number"
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Probabilidad (%)</label>
              <input
                type="number"
                value={form.probability}
                onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}
                min="0" max="100"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Etapa</label>
              <select
                value={form.stage}
                onChange={e => handleStageChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
              >
                {DEAL_STAGES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha cierre</label>
              <input
                type="date"
                value={form.expected_close_date}
                onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Empresa</label>
              <input
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Nombre empresa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contacto</label>
              <select
                value={form.contact_id}
                onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
              >
                <option value="">Sin contacto</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                placeholder="Detalles del negocio..."
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition shadow-sm"
            >
              {deal ? 'Guardar cambios' : 'Crear negocio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
