'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Kanban,
  Users,
  Briefcase,
  LogOut,
  Zap,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/deals', label: 'Negocios', icon: Briefcase },
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
    : userEmail?.[0].toUpperCase() ?? 'U'

  return (
    <aside className="w-64 flex-shrink-0 h-screen flex flex-col" style={{ background: '#1E1B4B' }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-900/50">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Florencia</p>
            <p className="text-white/40 text-xs">CRM Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
          Principal
        </p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
                isActive
                  ? 'bg-violet-600/25 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/8'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-violet-400' : 'text-white/50 group-hover:text-white/80'}`} />
              <span className="text-sm font-medium flex-1">{label}</span>
              {isActive && <ChevronRight className="w-4 h-4 text-violet-400" />}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{userName || 'Usuario'}</p>
            <p className="text-white/40 text-xs truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-red-600/20 transition-all duration-150 group"
        >
          <LogOut className="w-4 h-4 flex-shrink-0 group-hover:text-red-400" />
          <span className="text-sm font-medium">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
