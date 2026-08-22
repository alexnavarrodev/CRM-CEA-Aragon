'use client'

import { useState } from 'react'

export default function InscripcionForm() {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setErr('')
    if (!nombre.trim()) return setErr('Escribe tu nombre completo')
    if (telefono.trim().length < 10) return setErr('Escribe un número de WhatsApp válido (10 dígitos)')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Escribe un correo válido')

    setLoading(true)
    try {
      const r = await fetch('/api/inscripcion/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim() }),
      })
      const d = await r.json()
      if (d.init_point) window.location.href = d.init_point
      else { setErr(d.error || 'No se pudo iniciar el pago'); setLoading(false) }
    } catch {
      setErr('Error de conexión. Intenta de nuevo.'); setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-white/60 text-xs font-medium mb-1.5">Nombre completo</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo"
          className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-white/60 text-xs font-medium mb-1.5">WhatsApp</label>
        <input value={telefono} onChange={e => setTelefono(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric" placeholder="55 1234 5678"
          className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-white/60 text-xs font-medium mb-1.5">Correo</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="tu@correo.com"
          className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500" />
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition text-white font-semibold text-sm shadow-lg shadow-blue-900/30 disabled:opacity-60 mt-1"
      >
        {loading ? 'Abriendo pago…' : '💳 Pagar inscripción y reservar mi lugar'}
      </button>
      {err && <p className="text-red-300 text-xs text-center">{err}</p>}
      <p className="text-white/30 text-[11px] text-center leading-relaxed">
        Al pagar aceptas que un asesor de CEA Aragón te contacte por WhatsApp para agendar tu cita.
      </p>
    </div>
  )
}
