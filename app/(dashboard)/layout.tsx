import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userName = user.user_metadata?.full_name as string | undefined

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar userEmail={user.email} userName={userName} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
