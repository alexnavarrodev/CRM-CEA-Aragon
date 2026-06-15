'use client'

import { useState } from 'react'

export default function BotonPagar({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const pagar = async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/pagos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
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
    <div className="space-y-2">
      <button
        onClick={pagar}
        disabled={loading}
        className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition text-white font-semibold text-base shadow-lg shadow-blue-900/40 disabled:opacity-60"
      >
        {loading ? 'Abriendo pago seguro…' : '💳 Pagar ahora (SPEI o tarjeta)'}
      </button>
      {err && <p className="text-red-300 text-xs text-center">{err}</p>}
      <p className="text-white/35 text-[11px] text-center">Pago seguro procesado por Mercado Pago</p>
    </div>
  )
}
