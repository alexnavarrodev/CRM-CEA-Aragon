'use client'

import { useState, useEffect } from 'react'
import { Contact } from '@/lib/types'
import { X } from 'lucide-react'

interface ContactModalProps {
  contact: Contact | null
  onSave: (data: Partial<Contact>) => void
  onClose: () => void
}

export default function ContactModal({ contact, onSave, onClose }: ContactModalProps) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', position: '', status: 'active', notes: '',
  })

  useEffect(() => {
    if (contact) {
      setForm({
        name: contact.name,
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        company: contact.company ?? '',
        position: contact.position ?? '',
        status: contact.status ?? 'active',
        notes: contact.notes ?? '',
      })
    }
  }, [contact])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      position: form.position || null,
      status: form.status as Contact['status'],
      notes: form.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-lg">
            {contact ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="+52 55 1234 5678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Empresa</label>
              <input
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Nombre de empresa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cargo</label>
              <input
                value={form.position}
                onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Director, Manager..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
              >
                <option value="active">Activo</option>
                <option value="prospect">Prospecto</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                placeholder="Notas adicionales..."
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
              {contact ? 'Guardar cambios' : 'Crear contacto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
