'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    }
  }

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-600 rounded-2xl mb-4 shadow-lg shadow-violet-600/30">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">CRM Florencia</h1>
        <p className="text-white/60 text-sm mt-1">Crea tu cuenta</p>
      </div>

      {success ? (
        <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-200 text-center">
          <p className="font-medium">¡Cuenta creada!</p>
          <p className="text-sm mt-1">Revisa tu email para confirmar tu cuenta.</p>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              placeholder="Tu nombre"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-600/30 mt-2"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-white/60 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-violet-300 hover:text-violet-200 font-medium transition">
          Inicia sesión
        </Link>
      </p>
    </div>
  )
}
