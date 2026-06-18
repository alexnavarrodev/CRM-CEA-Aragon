'use client'

import { useState } from 'react'

export default function BotonPagar({ token, concepto = 'mensualidad', label }: {
  token: string
  concepto?: 'mensualidad' | 'uniforme' | 'certificado'
  label?: string
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const pagar = async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/pagos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, concepto }),
      })
      const d = await r.json()
      if (d.init_point) {
        window.location.href = d.init_point
      } else {
        setErr(d.error || 'No se pudo iniciar el pago')
        setLoading(false)
      }
    } catch {
      setErr('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={pagar}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition text-white font-semibold text-sm shadow-lg shadow-blue-900/30 disabled:opacity-60"
      >
        {loading ? 'Abriendo pago…' : (label ?? '💳 Pagar ahora')}
      </button>
      {err && <p className="text-red-300 text-xs text-center mt-1">{err}</p>}
    </div>
  )
}
