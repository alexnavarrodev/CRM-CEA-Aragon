export type ContactStatus = 'active' | 'inactive' | 'prospect'
export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task'

export interface Contact {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  position: string | null
  avatar_url: string | null
  status: ContactStatus
  tags: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Deal {
  id: string
  user_id: string
  title: string
  value: number
  stage: DealStage
  contact_id: string | null
  company: string | null
  description: string | null
  expected_close_date: string | null
  probability: number
  position: number
  created_at: string
  updated_at: string
  contact?: Contact
}

export interface Activity {
  id: string
  user_id: string
  deal_id: string | null
  contact_id: string | null
  type: ActivityType
  title: string
  description: string | null
  completed: boolean
  due_date: string | null
  created_at: string
  deal?: Deal
  contact?: Contact
}

export const DEAL_STAGES: { id: DealStage; label: string; color: string; bg: string; probability: number }[] = [
  { id: 'lead', label: 'Nuevo Lead', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', probability: 10 },
  { id: 'qualified', label: 'Calificado', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', probability: 25 },
  { id: 'proposal', label: 'Propuesta', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', probability: 50 },
  { id: 'negotiation', label: 'Negociación', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', probability: 75 },
  { id: 'closed_won', label: 'Ganado', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', probability: 100 },
  { id: 'closed_lost', label: 'Perdido', color: 'text-red-600', bg: 'bg-red-50 border-red-200', probability: 0 },
]
