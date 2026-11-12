'use client'

// Reverso del carnet ("Control de pagos"), mismo formato que el carnet impreso de Alex:
// hoja carta con 4 cuartos de 10.5 x 14 cm = 2 carnets por hoja. En cada carnet:
//   · cuarto IZQUIERDO: colegiaturas del grupo con fecha y concepto ya impresos
//   · cuarto DERECHO: tabla en blanco para anotar libre (uniformes, certificado, cursos)
// Impreso a doble cara (volteo por el lado largo), el cuarto izquierdo del reverso queda
// detrás de la portada, o sea: es la primera página al abrir el carnet.
// Fuera de (dashboard) para que no salga el menú lateral al imprimir.
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { kvGet } from '@/lib/kv'
import { MESES_FULL } from '@/lib/types'
import type { PaymentCalendar } from '@/lib/nomina'

const FILAS = 13 // las mismas filas que la tabla del carnet

interface Fila { fecha: string; concepto: string; extra?: string }

function filasDe(cal: PaymentCalendar): Fila[] {
  return [cal.inicio, ...cal.pagos].map((f, i) => {
    const [d, m, y] = f.split('/')
    const mes = (MESES_FULL[Number(m) - 1] ?? '').toLowerCase()
    const liq = i > 0 && cal.liqCertIndex === i - 1
    return { fecha: `${d}/${m}/${y.slice(2)}`, concepto: `Colegiatura ${mes}`, extra: liq ? '+ liquidar certificado' : undefined }
  })
}

function Tabla({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  return (
    <div className="cuarto">
      <div className="titulo">{titulo}</div>
      <table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Cantidad</th><th>Firma y<br />Fecha</th></tr></thead>
        <tbody>
          {Array.from({ length: FILAS }, (_, i) => {
            const f = filas[i]
            return (
              <tr key={i}>
                <td className="fecha">{f?.fecha ?? ''}</td>
                <td className="concepto">{f ? <>{f.concepto}{f.extra && <><br /><b>{f.extra}</b></>}</> : ''}</td>
                <td /><td />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function CarnetPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cal, setCal] = useState<PaymentCalendar | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const cals = (await kvGet<PaymentCalendar[]>(supabase, 'payment_calendars_v2')) ?? []
      setCal(cals.find(c => c.id === decodeURIComponent(id)) ?? null)
    })()
  }, [id, router])

  if (cal === undefined) return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Cargando…</p>
  if (cal === null) return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>No encontré ese calendario.</p>

  const colegiaturas = <Tabla titulo={`Colegiaturas · ${cal.nombre}`} filas={filasDe(cal)} />
  const libre = <Tabla titulo="Control de pagos" filas={[]} />

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap" />
      <style>{`
        @page { size: letter; margin: 0; }
        body { margin: 0; background: #e2e8f0; }
        .barra { font-family: sans-serif; padding: 12px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .barra button { background: #2563eb; color: #fff; border: 0; border-radius: 10px; padding: 8px 16px; font-size: 14px; cursor: pointer; }
        .barra p { margin: 0; color: #475569; font-size: 13px; max-width: 720px; }
        .hoja { width: 21cm; height: 27.9cm; margin: 0 auto; background: #fff; display: grid;
                grid-template-columns: 10.5cm 10.5cm; grid-template-rows: 13.95cm 13.95cm; position: relative;
                font-family: Merriweather, Georgia, 'Times New Roman', serif; color: #111; }
        .hoja::before { content: ''; position: absolute; left: calc(10.5cm - 0.06cm); top: 0; bottom: 0; width: 0.12cm; background: #a3a3a3; }
        .hoja::after  { content: ''; position: absolute; top: calc(13.95cm - 0.06cm); left: 0; right: 0; height: 0.12cm; background: #a3a3a3; }
        .cuarto { padding: 0.45cm 0.5cm 0 0.45cm; box-sizing: border-box; overflow: hidden; }
        .titulo { text-align: center; font-weight: 700; font-size: 12.5pt; height: 0.75cm; line-height: 0.75cm; margin-bottom: 0.05cm; }
        table { width: 9.5cm; border-collapse: collapse; table-layout: fixed; }
        th { background: #ececec; height: 1.25cm; border: 1px solid #222; font-size: 11pt; font-weight: 700; line-height: 1.15; }
        td { height: 0.83cm; border: 1px solid #222; padding: 0 0.1cm; vertical-align: middle; }
        td.fecha { text-align: center; font-weight: 700; font-size: 8.5pt; white-space: nowrap; }
        td.concepto { font-size: 7pt; line-height: 1.2; }
        @media print {
          body { background: #fff; }
          .barra { display: none; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="barra">
        <button onClick={() => window.print()}>Imprimir</button>
        <p>Reverso del carnet, 2 carnets por hoja. Imprímelo detrás de la hoja de portada/reglamento, volteando por el
          <b> lado largo</b>. En el diálogo elige papel <b>Carta</b>, márgenes <b>Ninguno</b> y escala <b>100%</b>.</p>
      </div>
      <div className="hoja">
        {colegiaturas}{libre}
        {colegiaturas}{libre}
      </div>
    </>
  )
}
