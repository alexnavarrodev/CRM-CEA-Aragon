import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Eres un asistente contable para una escuela de enfermería en México.
El usuario dictará en voz alta un movimiento financiero en español.
Extrae la información y devuelve SOLO un objeto JSON con exactamente estos campos:
{
  "tipo": "ingreso" | "egreso",
  "concepto": string,
  "monto": number,
  "canal": "efectivo" | "transferencia" | "tarjeta",
  "categoria": "inscripcion" | "colegiatura" | "bachillerato" | "materiales" | "otros",
  "alumna_nombre": string | null
}

Reglas:
- tipo: "ingreso" para pagos recibidos, cobros, mensualidades. "egreso" para gastos, compras, pagos a proveedores.
- Si no se menciona el canal de pago, usa "efectivo".
- Si no se menciona tipo, asume "ingreso".
- alumna_nombre: extrae el nombre de la alumna si se menciona, de lo contrario null.
- concepto: descripción corta y clara del movimiento (máx 60 caracteres).
- monto: solo el número, sin símbolos de moneda.
- categoria: elige la más apropiada. "colegiatura" para mensualidades de colegiatura, "bachillerato" para pagos de bachillerato, "inscripcion" para inscripciones.
- Responde SOLO con el JSON válido, sin texto adicional, sin bloques de código.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
  }

  let transcript = ''
  let alumnas: Array<{ id: string; nombre: string }> = []

  try {
    const body = await req.json()
    transcript = body.transcript ?? ''
    alumnas = body.alumnas ?? []
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: 'Transcripción vacía' }, { status: 400 })
  }

  const alumnasList =
    alumnas.length > 0
      ? `\n\nAlumnas registradas en el sistema (para identificar nombres):\n${alumnas.map(a => a.nombre).join(', ')}`
      : ''

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + alumnasList },
        { role: 'user', content: transcript },
      ],
      temperature: 0.1,
      max_tokens: 300,
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('OpenAI error:', errText)
    return NextResponse.json({ error: 'Error al contactar OpenAI' }, { status: 502 })
  }

  const data = await openaiRes.json()
  const raw = data.choices?.[0]?.message?.content ?? ''

  let parsed: Record<string, unknown>
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    console.error('Parse error. Raw:', raw)
    return NextResponse.json({ error: 'No se pudo interpretar la respuesta de IA', raw }, { status: 500 })
  }

  // Match alumna_nombre to an actual alumna_id
  parsed.alumna_id = null
  if (parsed.alumna_nombre && alumnas.length > 0) {
    const normalizar = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()

    const nombreBuscado = normalizar(parsed.alumna_nombre as string)
    const match = alumnas.find(a => {
      const n = normalizar(a.nombre)
      return (
        n.includes(nombreBuscado) ||
        nombreBuscado.includes(n) ||
        n.split(' ').some(part => part.length > 2 && nombreBuscado.includes(part))
      )
    })
    if (match) parsed.alumna_id = match.id
  }

  return NextResponse.json(parsed)
}
