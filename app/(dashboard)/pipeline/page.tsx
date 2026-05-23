import { createClient } from '@/lib/supabase/server'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import { Plus } from 'lucide-react'

export const revalidate = 0

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: deals }, { data: contacts }] = await Promise.all([
    supabase.from('deals').select('*, contact:contacts(*)').eq('user_id', user!.id).order('created_at', { ascending: false }),
    supabase.from('contacts').select('*').eq('user_id', user!.id).order('name'),
  ])

  const totalPipeline = (deals ?? [])
    .filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((sum, d) => sum + Number(d.value), 0)

  const wonThisMonth = (deals ?? [])
    .filter(d => {
      if (d.stage !== 'closed_won') return false
      const date = new Date(d.updated_at)
      const now = new Date()
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    })
    .reduce((sum, d) => sum + Number(d.value), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pipeline de ventas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <span className="font-medium text-violet-600">${totalPipeline.toLocaleString('es-MX')}</span>
            {' '}en pipeline · Ganado este mes: {' '}
            <span className="font-medium text-emerald-600">${wonThisMonth.toLocaleString('es-MX')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>{deals?.length ?? 0} negocios totales</span>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto p-6">
        <KanbanBoard
          initialDeals={deals ?? []}
          contacts={contacts ?? []}
          userId={user!.id}
        />
      </div>
    </div>
  )
}
