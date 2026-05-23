'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Deal, DEAL_STAGES } from '@/lib/types'
import { Calendar, Building2, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface KanbanCardProps {
  deal: Deal
  onEdit: (deal: Deal) => void
  onDelete: (id: string) => void
}

export default function KanbanCard({ deal, onEdit, onDelete }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const stage = DEAL_STAGES.find(s => s.id === deal.stage)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group ${isDragging ? 'ring-2 ring-violet-400 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug">{deal.title}</p>
          {(deal.company || deal.contact?.company) && (
            <div className="flex items-center gap-1 mt-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500 truncate">{deal.company || deal.contact?.company}</span>
            </div>
          )}
          {deal.contact && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{deal.contact.name}</p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
          <button onClick={() => onEdit(deal)} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-violet-600" />
          </button>
          <button onClick={() => onDelete(deal.id)} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <span className="text-sm font-bold text-slate-700 tabular-nums">
          ${Number(deal.value).toLocaleString('es-MX')}
        </span>
        <div className="flex items-center gap-2">
          {deal.expected_close_date && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="w-3 h-3" />
              {format(new Date(deal.expected_close_date), 'dd MMM', { locale: es })}
            </div>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage?.color} ${stage?.bg}`}>
            {deal.probability}%
          </span>
        </div>
      </div>
    </div>
  )
}
