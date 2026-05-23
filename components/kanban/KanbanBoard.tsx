'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Deal, DealStage, DEAL_STAGES, Contact } from '@/lib/types'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import DealModal from '../DealModal'
import { createClient } from '@/lib/supabase/client'

interface KanbanBoardProps {
  initialDeals: Deal[]
  contacts: Contact[]
  userId: string
}

export default function KanbanBoard({ initialDeals, contacts, userId }: KanbanBoardProps) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [defaultStage, setDefaultStage] = useState<string>('lead')

  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeDeal = deals.find(d => d.id === activeId)
    if (!activeDeal) return

    // If dragging over a column (not a card)
    const isOverColumn = DEAL_STAGES.some(s => s.id === overId)
    if (isOverColumn && activeDeal.stage !== overId) {
      setDeals(prev =>
        prev.map(d => d.id === activeId ? { ...d, stage: overId as DealStage } : d)
      )
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeDeal = deals.find(d => d.id === activeId)
    if (!activeDeal) return

    let newStage = activeDeal.stage
    const isOverColumn = DEAL_STAGES.some(s => s.id === overId)

    if (isOverColumn) {
      newStage = overId as DealStage
    } else {
      const overDeal = deals.find(d => d.id === overId)
      if (overDeal) newStage = overDeal.stage
    }

    if (newStage !== activeDeal.stage) {
      const stage = DEAL_STAGES.find(s => s.id === newStage)
      setDeals(prev =>
        prev.map(d => d.id === activeId
          ? { ...d, stage: newStage, probability: stage?.probability ?? d.probability }
          : d
        )
      )
      await supabase.from('deals').update({
        stage: newStage,
        probability: stage?.probability ?? activeDeal.probability,
        updated_at: new Date().toISOString(),
      }).eq('id', activeId)
    }
  }

  const handleAddDeal = (stage: string) => {
    setDefaultStage(stage)
    setEditingDeal(null)
    setModalOpen(true)
  }

  const handleEditDeal = (deal: Deal) => {
    setEditingDeal(deal)
    setModalOpen(true)
  }

  const handleDeleteDeal = async (id: string) => {
    if (!confirm('¿Eliminar este negocio?')) return
    setDeals(prev => prev.filter(d => d.id !== id))
    await supabase.from('deals').delete().eq('id', id)
  }

  const handleSaveDeal = async (data: Partial<Deal>) => {
    if (editingDeal) {
      const updated = { ...editingDeal, ...data, updated_at: new Date().toISOString() }
      setDeals(prev => prev.map(d => d.id === editingDeal.id ? updated : d))
      await supabase.from('deals').update({
        title: data.title,
        value: data.value,
        stage: data.stage,
        company: data.company,
        description: data.description,
        expected_close_date: data.expected_close_date,
        probability: data.probability,
        contact_id: data.contact_id,
        updated_at: new Date().toISOString(),
      }).eq('id', editingDeal.id)
    } else {
      const stage = DEAL_STAGES.find(s => s.id === data.stage)
      const newDeal: Omit<Deal, 'id' | 'created_at' | 'updated_at'> = {
        user_id: userId,
        title: data.title ?? 'Nuevo negocio',
        value: data.value ?? 0,
        stage: (data.stage as DealStage) ?? 'lead',
        company: data.company ?? null,
        description: data.description ?? null,
        expected_close_date: data.expected_close_date ?? null,
        probability: stage?.probability ?? 10,
        position: 0,
        contact_id: data.contact_id ?? null,
      }
      const { data: inserted } = await supabase.from('deals').insert(newDeal).select('*, contact:contacts(*)').single()
      if (inserted) setDeals(prev => [...prev, inserted])
    }
    setModalOpen(false)
    setEditingDeal(null)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 pb-6">
          {DEAL_STAGES.map(stage => (
            <KanbanColumn
              key={stage.id}
              id={stage.id}
              label={stage.label}
              color={stage.color}
              bg={stage.bg}
              deals={deals.filter(d => d.stage === stage.id)}
              onAddDeal={handleAddDeal}
              onEditDeal={handleEditDeal}
              onDeleteDeal={handleDeleteDeal}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && (
            <div className="rotate-2 opacity-90 shadow-2xl">
              <KanbanCard deal={activeDeal} onEdit={() => {}} onDelete={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {modalOpen && (
        <DealModal
          deal={editingDeal}
          defaultStage={defaultStage}
          contacts={contacts}
          onSave={handleSaveDeal}
          onClose={() => { setModalOpen(false); setEditingDeal(null) }}
        />
      )}
    </>
  )
}
