import { createClient } from '@/lib/supabase/server'
import { Users, Briefcase, TrendingUp, DollarSign, Plus, ArrowUpRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { DEAL_STAGES } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: contacts },
    { data: deals },
    { data: activities },
  ] = await Promise.all([
    supabase.from('contacts').select('*').eq('user_id', user!.id),
    supabase.from('deals').select('*, contact:contacts(name, company)').eq('user_id', user!.id),
    supabase.from('activities').select('*, contact:contacts(name), deal:deals(title)').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(5),
  ])

  const totalDeals = deals?.length ?? 0
  const totalContacts = contacts?.length ?? 0
  const pipelineValue = deals?.filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((sum, d) => sum + Number(d.value), 0) ?? 0
  const wonValue = deals?.filter(d => d.stage === 'closed_won')
    .reduce((sum, d) => sum + Number(d.value), 0) ?? 0

  const dealsByStage = DEAL_STAGES.map(stage => ({
    ...stage,
    count: deals?.filter(d => d.stage === stage.id).length ?? 0,
    value: deals?.filter(d => d.stage === stage.id).reduce((s, d) => s + Number(d.value), 0) ?? 0,
  }))

  const recentDeals = deals?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) ?? []

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Resumen de tu actividad comercial</p>
        </div>
        <div className="flex gap-2">
          <Link href="/contacts" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition shadow-sm">
            <Plus className="w-4 h-4" />
            Contacto
          </Link>
          <Link href="/pipeline" className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition shadow-sm shadow-violet-200">
            <Plus className="w-4 h-4" />
            Negocio
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Contactos"
          value={totalContacts}
          icon={<Users className="w-5 h-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          trend="+2 este mes"
        />
        <KpiCard
          title="Negocios activos"
          value={totalDeals}
          icon={<Briefcase className="w-5 h-5" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          trend={`${deals?.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length ?? 0} en curso`}
        />
        <KpiCard
          title="Pipeline"
          value={`$${pipelineValue.toLocaleString('es-MX')}`}
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          trend="Valor potencial"
        />
        <KpiCard
          title="Ganado"
          value={`$${wonValue.toLocaleString('es-MX')}`}
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          trend="Total cerrado"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline by Stage */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Estado del pipeline</h2>
            <Link href="/pipeline" className="text-violet-600 text-sm font-medium hover:text-violet-700 flex items-center gap-1">
              Ver kanban <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {dealsByStage.map(stage => (
              <div key={stage.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${stage.color}`}>{stage.label}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{stage.count}</span>
                  </div>
                  <span className="text-sm text-slate-600 font-medium">${stage.value.toLocaleString('es-MX')}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stage.id === 'lead' ? 'bg-blue-400' :
                      stage.id === 'qualified' ? 'bg-violet-400' :
                      stage.id === 'proposal' ? 'bg-orange-400' :
                      stage.id === 'negotiation' ? 'bg-yellow-400' :
                      stage.id === 'closed_won' ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                    style={{ width: totalDeals > 0 ? `${(stage.count / totalDeals) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
          {totalDeals === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm">No hay negocios aún</p>
              <Link href="/pipeline" className="mt-2 inline-flex items-center gap-1 text-violet-600 text-sm font-medium hover:text-violet-700">
                <Plus className="w-3.5 h-3.5" /> Crear primer negocio
              </Link>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Actividad reciente</h2>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          {activities && activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map(activity => (
                <div key={activity.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 text-violet-600 text-xs font-bold">
                    {activity.type === 'call' ? '📞' : activity.type === 'email' ? '✉️' : activity.type === 'meeting' ? '🤝' : '📝'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{activity.title}</p>
                    <p className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-8">Sin actividad reciente</p>
          )}
        </div>
      </div>

      {/* Recent Deals */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Negocios recientes</h2>
          <Link href="/deals" className="text-violet-600 text-sm font-medium hover:text-violet-700 flex items-center gap-1">
            Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentDeals.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentDeals.map(deal => {
              const stage = DEAL_STAGES.find(s => s.id === deal.stage)
              return (
                <div key={deal.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/50 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{deal.title}</p>
                    <p className="text-xs text-slate-400">{(deal as any).contact?.name ?? deal.company ?? '—'}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${stage?.bg}`}>
                    {stage?.label}
                  </span>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">
                    ${Number(deal.value).toLocaleString('es-MX')}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Briefcase className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay negocios aún</p>
            <Link href="/pipeline" className="mt-2 inline-flex items-center gap-1 text-violet-600 text-sm font-medium hover:text-violet-700">
              <Plus className="w-3.5 h-3.5" /> Crear primer negocio
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  title, value, icon, iconBg, iconColor, trend,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  trend?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {trend && <p className="text-xs text-slate-400 mt-1">{trend}</p>}
        </div>
        <div className={`w-10 h-10 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
