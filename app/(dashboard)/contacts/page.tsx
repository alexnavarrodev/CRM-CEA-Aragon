'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Contact } from '@/lib/types'
import ContactModal from '@/components/ContactModal'
import { Plus, Search, Mail, Phone, Building2, Pencil, Trash2, Users } from 'lucide-react'

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setContacts(data ?? [])
      setLoading(false)
    }
    load()

    // Real-time subscription
    const channel = supabase
      .channel('contacts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, payload => {
        if (payload.eventType === 'INSERT') {
          setContacts(prev => [payload.new as Contact, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setContacts(prev => prev.map(c => c.id === payload.new.id ? payload.new as Contact : c))
        } else if (payload.eventType === 'DELETE') {
          setContacts(prev => prev.filter(c => c.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSave = async (data: Partial<Contact>) => {
    if (editingContact) {
      await supabase.from('contacts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingContact.id)
      setContacts(prev => prev.map(c => c.id === editingContact.id ? { ...c, ...data } : c))
    } else {
      const { data: inserted } = await supabase.from('contacts').insert({ ...data, user_id: userId }).select().single()
      if (inserted) setContacts(prev => [inserted, ...prev])
    }
    setModalOpen(false)
    setEditingContact(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este contacto?')) return
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  )

  const statusConfig = {
    active: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    prospect: { label: 'Prospecto', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    inactive: { label: 'Inactivo', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contactos</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} contactos en total</p>
        </div>
        <button
          onClick={() => { setEditingContact(null); setModalOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition shadow-sm shadow-violet-200"
        >
          <Plus className="w-4 h-4" />
          Nuevo contacto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white shadow-sm"
          placeholder="Buscar por nombre, email o empresa..."
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              {search ? 'No se encontraron contactos' : 'Aún no tienes contactos'}
            </p>
            {!search && (
              <button
                onClick={() => { setEditingContact(null); setModalOpen(true) }}
                className="mt-3 text-violet-600 text-sm font-medium hover:text-violet-700 flex items-center gap-1 mx-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Crear primer contacto
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Contacto</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Empresa</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Teléfono</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Estado</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(contact => {
                  const status = statusConfig[contact.status as keyof typeof statusConfig] ?? statusConfig.active
                  const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  return (
                    <tr key={contact.id} className="hover:bg-slate-50/50 transition group">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{contact.name}</p>
                            {contact.position && <p className="text-xs text-slate-400">{contact.position}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        {contact.company ? (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {contact.company}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-3.5">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-violet-600 transition">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {contact.email}
                          </a>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-3.5">
                        {contact.phone ? (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {contact.phone}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition justify-end">
                          <button onClick={() => { setEditingContact(contact); setModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                            <Pencil className="w-4 h-4 text-slate-400 hover:text-violet-600" />
                          </button>
                          <button onClick={() => handleDelete(contact.id)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <ContactModal
          contact={editingContact}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingContact(null) }}
        />
      )}
    </div>
  )
}
