'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Deal } from '@/lib/types'
import KanbanCard from './KanbanCard'
import { Plus } from 'lucide-react'

interface KanbanColumnProps {
  id: string
  label: string
  color: string
  bg: string
  deals: Deal[]
  onAddDeal: (stage: string) => void
  onEditDeal: (deal: Deal) => void
  onDeleteDeal: (id: string) => void
}

export default function KanbanColumn({
  id, label, color, bg, deals, onAddDeal, onEditDeal, onDeleteDeal,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  const totalValue = deals.reduce((sum, d) => sum + Number(d.value), 0)

  return (
    <div className={`flex flex-col w-72 flex-shrink-0 rounded-2xl border transition-all duration-150 ${isOver ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200 bg-slate-50/80'}`}>
      {/* Column header */}
      <div className="px-4 py-3 border-b border-slate-200/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${color}`}>{label}</span>
            <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">
              {deals.length}
            </span>
          </div>
          <button
            onClick={() => onAddDeal(id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-400 hover:text-violet-600 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {deals.length > 0 && (
          <p className="text-xs text-slate-400 mt-1 font-medium">
            ${totalValue.toLocaleString('es-MX')}
          </p>
        )}
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 p-3 space-y-2 min-h-[200px] overflow-y-auto"
      >
        <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map(deal => (
            <KanbanCard
              key={deal.id}
              deal={deal}
              onEdit={onEditDeal}
              onDelete={onDeleteDeal}
            />
          ))}
        </SortableContext>
        {deals.length === 0 && !isOver && (
          <div className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-xs text-slate-400">Arrastra negocios aquí</p>
          </div>
        )}
      </div>
    </div>
  )
}
