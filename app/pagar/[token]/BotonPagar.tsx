'use client'

import { useState } from 'react'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

export default function BotonPagar({ token, concepto = 'mensualidad', label, editable = false, maxMonto = 0 }: {
  token: string
  concepto?: 'mensualidad' | 'uniforme' | 'certificado'
  label?: string
  editable?: boolean        // permite elegir cuánto aportar (uniforme/certificado)
  maxMonto?: number         // tope = lo que falta
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [monto, setMonto] = useState(editable ? String(maxMonto) : '')

  const montoNum = Math.min(maxMonto || Infinity, Math.max(0, Math.round(Number(monto) || 0)))

  const pagar = async () => {
    setLoading(true); setErr('')
    const body: Record<string, unknown> = { token, concepto }
    if (editable) {
      if (montoNum <= 0) { setErr('Escribe un monto'); setLoading(false); return }
      body.monto = montoNum
    }
    try {
      const r = await fetch('/api/pagos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.init_point) window.location.href = d.init_point
      else { setErr(d.error || 'No se pudo iniciar el pago'); setLoading(false) }
    } catch {
      setErr('Error de conexión. Intenta de nuevo.'); setLoading(false)
    }
  }

  return (
    <div>
      {editable && (
        <>
          <p className="text-white/50 text-xs mb-1.5">¿Cuánto quieres aportar?</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[500, 1000, 2000].filter(v => v < maxMonto).map(v => (
              <button key={v} onClick={() => setMonto(String(v))}
                className={`px-2.5 py-1 rounded-lg text-xs border transition ${montoNum === v ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
                {fmt(v)}
              </button>
            ))}
            <button onClick={() => setMonto(String(maxMonto))}
              className={`px-2.5 py-1 rounded-lg text-xs border transition ${montoNum === maxMonto ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
              Todo ({fmt(maxMonto)})
            </button>
          </div>
          <div className="relative mb-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
            <input
              type="number" inputMode="numeric" min={1} max={maxMonto} value={monto}
              onChange={e => setMonto(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </>
      )}
      <button
        onClick={pagar}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 transition text-white font-semibold text-sm shadow-lg shadow-blue-900/30 disabled:opacity-60"
      >
        {loading ? 'Abriendo pago…' : (editable ? `💳 Aportar · ${fmt(montoNum)}` : (label ?? '💳 Pagar ahora'))}
      </button>
      {err && <p className="text-red-300 text-xs text-center mt-1">{err}</p>}
    </div>
  )
}
