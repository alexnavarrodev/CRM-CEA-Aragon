'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, CreditCard, GraduationCap, Wallet,
  UserPlus, Users, UserCheck, BarChart2, Settings, LogOut, Search,
} from 'lucide-react'

const nav = [
  {
    section: 'OPERACIÓN',
    items: [
      { href: '/dashboard',     label: 'Panel',        icon: LayoutDashboard },
      { href: '/colegiaturas',  label: 'Colegiaturas', icon: CreditCard },
      { href: '/bachillerato',  label: 'Bachillerato', icon: GraduationCap },
      { href: '/caja',          label: 'Caja',         icon: Wallet },
    ],
  },
  {
    section: 'PERSONAS',
    items: [
      { href: '/prospectos', label: 'Prospectos', icon: UserPlus },
      { href: '/alumnas',    label: 'Alumnas',    icon: Users },
      { href: '/egresadas',  label: 'Egresadas',  icon: UserCheck },
    ],
  },
  {
    section: 'MÁS',
    items: [
      { href: '/reportes', label: 'Reportes', icon: BarChart2 },
      { href: '/ajustes',  label: 'Ajustes',  icon: Settings },
    ],
  },
]

interface SidebarProps {
  userEmail?: string
  userName?: string
}

export default function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? 'U'

  const displayName = userName || userEmail?.split('@')[0] || 'Usuario'

  return (
    <aside className="w-64 flex-shrink-0 h-screen flex flex-col" style={{ background: '#0F172A' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
               style={{ background: '#2563EB' }}>
            FN
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Florencia Nightingale</p>
            <p className="text-white/40 text-xs">Escuela de Enfermería</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/6 text-white/40 text-sm cursor-pointer hover:bg-white/10 transition">
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1">Buscar...</span>
          <kbd className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-white/30">⌘K</kbd>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {nav.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1">
              {section}
            </p>
            {items.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-all text-sm font-medium ${
                    isActive
                      ? 'text-white'
                      : 'text-white/50 hover:text-white hover:bg-white/6'
                  }`}
                  style={isActive ? { background: 'rgba(37,99,235,0.25)' } : {}}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-white/40'}`} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/8">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
               style={{ background: '#2563EB' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-white/35 text-xs">Directora</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/6 transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
