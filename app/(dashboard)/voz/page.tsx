'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Mic, MicOff, Loader2, CheckCircle2, AlertCircle,
  RotateCcw, Save, ChevronDown,
} from 'lucide-react'

// ── Speech Recognition types (not always in DOM lib) ──────────────────────────
interface ISpeechRecognitionResult {
  isFinal: boolean
  readonly length: number
  item(index: number): { transcript: string; confidence: number }
  [index: number]: { transcript: string; confidence: number }
}
interface ISpeechRecognitionResultList {
  readonly length: number
  item(index: number): ISpeechRecognitionResult
  [index: number]: ISpeechRecognitionResult
}
interface ISpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: ISpeechRecognitionResultList
}
interface ISpeechRecognitionErrorEvent {
  readonly error: string
  readonly message: string
}
interface ISpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null
  start(): void
  stop(): void
  abort(): void
}
declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition
    webkitSpeechRecognition?: new () => ISpeechRecognition
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type Estado = 'idle' | 'grabando' | 'procesando' | 'confirmar' | 'guardando' | 'exito' | 'error'

type EntradaParsed = {
  tipo: 'ingreso' | 'egreso'
  concepto: string
  monto: number
  canal: 'efectivo' | 'transferencia' | 'tarjeta'
  categoria: string
  alumna_nombre: string | null
  alumna_id: string | null
}

const CATEGORIAS = [
  { key: 'ambos',        label: 'Col. + Bachi' },
  { key: 'inscripcion',  label: 'Inscripción' },
  { key: 'colegiatura',  label: 'Colegiatura' },
  { key: 'bachillerato', label: 'Bachillerato' },
  { key: 'materiales',   label: 'Materiales' },
  { key: 'otros',        label: 'Otros' },
]

const CANALES = [
  { key: 'efectivo',      label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta',       label: 'Tarjeta' },
]

export default function VozPage() {
  const supabase = createClient()

  const [estado, setEstado] = useState<Estado>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [entrada, setEntrada] = useState<EntradaParsed | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [alumnas, setAlumnas] = useState<{ id: string; nombre: string; programa: string }[]>([])
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const transcriptRef = useRef('')

  // Keep ref in sync with state
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // Load alumnas for name matching
  useEffect(() => {
    supabase
      .from('alumnas')
      .select('id, nombre, programa')
      .eq('status', 'activa')
      .then(({ data }) => { if (data) setAlumnas(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const procesarTranscript = useCallback(async (text: string) => {
    setEstado('procesando')
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, alumnas }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Error al procesar con IA')
        setEstado('error')
        return
      }
      setEntrada(data as EntradaParsed)
      setFecha(new Date().toISOString().slice(0, 10))
      setEstado('confirmar')
    } catch {
      setErrorMsg('Error de red al contactar la API')
      setEstado('error')
    }
  }, [alumnas])

  const iniciarGrabacion = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setErrorMsg('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari.')
      setEstado('error')
      return
    }

    const rec = new SR()
    rec.lang = 'es-MX'
    rec.continuous = false
    rec.interimResults = true

    rec.onresult = (e: ISpeechRecognitionEvent) => {
      let finalText = ''
      let interimPart = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interimPart += e.results[i][0].transcript
      }
      if (finalText) {
        setTranscript(finalText)
        transcriptRef.current = finalText
      }
      setInterimText(interimPart)
    }

    rec.onend = () => {
      setInterimText('')
      const t = transcriptRef.current
      if (t.trim()) {
        procesarTranscript(t)
      } else {
        setEstado('idle')
      }
    }

    rec.onerror = (e: ISpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech') {
        setEstado('idle')
      } else {
        setErrorMsg(`Error de micrófono: ${e.error}`)
        setEstado('error')
      }
    }

    recognitionRef.current = rec
    setTranscript('')
    transcriptRef.current = ''
    rec.start()
    setEstado('grabando')
  }, [procesarTranscript])

  const detenerGrabacion = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const guardar = async () => {
    if (!entrada) return
    setEstado('guardando')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { error } = await supabase.from('movimientos_caja').insert({
        user_id: user.id,
        tipo: entrada.tipo,
        concepto: entrada.concepto,
        monto: entrada.monto,
        canal: entrada.canal,
        categoria: entrada.categoria,
        fecha,
        alumna_id: entrada.alumna_id,
      })

      if (error) throw error
      setEstado('exito')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al guardar')
      setEstado('error')
    }
  }

  const reiniciar = () => {
    setEstado('idle')
    setTranscript('')
    transcriptRef.current = ''
    setInterimText('')
    setEntrada(null)
    setErrorMsg('')
    setFecha(new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Title — solo visible en desktop (en móvil el layout ya tiene top bar) */}
      <div className="hidden lg:flex px-5 pt-6 pb-4 items-center gap-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-[11px] text-white flex-shrink-0">
          CEA
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Caja Rápida</p>
          <p className="text-white/40 text-xs">Registro por voz</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-12">

        {/* ── IDLE ── */}
        {estado === 'idle' && (
          <div className="flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="text-center">
              <p className="text-white/60 text-sm leading-relaxed">
                Presiona el botón y di el movimiento en voz alta
              </p>
              <p className="text-white/30 text-xs mt-2 italic">
                "Recibí dos mil pesos de María García por colegiatura en efectivo"
              </p>
            </div>
            <button
              onClick={iniciarGrabacion}
              className="w-36 h-36 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center shadow-2xl shadow-blue-900/60"
            >
              <Mic className="w-16 h-16 text-white" />
            </button>
            <p className="text-white/30 text-xs">Toca para grabar</p>
          </div>
        )}

        {/* ── GRABANDO ── */}
        {estado === 'grabando' && (
          <div className="flex flex-col items-center gap-8 w-full max-w-sm">
            {(transcript || interimText) && (
              <div className="w-full rounded-2xl bg-white/8 border border-white/10 px-5 py-4 text-sm min-h-[60px]">
                <p className="text-white leading-relaxed">{transcript}</p>
                {interimText && <p className="text-white/40 italic">{interimText}</p>}
              </div>
            )}
            <button
              onClick={detenerGrabacion}
              className="w-36 h-36 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition-all flex items-center justify-center shadow-2xl shadow-red-900/60"
              style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
            >
              <MicOff className="w-16 h-16 text-white" />
            </button>
            <p className="text-white/60 text-sm">Grabando… toca para terminar</p>
          </div>
        )}

        {/* ── PROCESANDO ── */}
        {estado === 'procesando' && (
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium">Procesando con IA…</p>
              {transcript && (
                <p className="text-white/40 text-sm mt-2 italic max-w-xs">"{transcript}"</p>
              )}
            </div>
          </div>
        )}

        {/* ── CONFIRMAR ── */}
        {estado === 'confirmar' && entrada && (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="text-center mb-1">
              <p className="text-white font-semibold text-base">Confirmar movimiento</p>
              {transcript && (
                <p className="text-white/30 text-xs mt-1 italic">"{transcript}"</p>
              )}
            </div>

            {/* Tipo */}
            <div className="flex gap-2">
              {(['ingreso', 'egreso'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setEntrada(prev => prev ? { ...prev, tipo: t } : prev)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                    entrada.tipo === t
                      ? t === 'ingreso'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'bg-white/8 text-white/40 hover:bg-white/12'
                  }`}
                >
                  {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                </button>
              ))}
            </div>

            {/* Concepto */}
            <div>
              <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Concepto</label>
              <input
                className="w-full bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500 transition"
                value={entrada.concepto}
                onChange={e => setEntrada(prev => prev ? { ...prev, concepto: e.target.value } : prev)}
              />
            </div>

            {/* Monto */}
            <div>
              <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Monto ($)</label>
              <input
                type="number"
                inputMode="decimal"
                className="w-full bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500 transition"
                value={entrada.monto}
                onChange={e => setEntrada(prev => prev ? { ...prev, monto: parseFloat(e.target.value) || 0 } : prev)}
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Categoría</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition"
                  value={entrada.categoria}
                  onChange={e => setEntrada(prev => prev ? { ...prev, categoria: e.target.value } : prev)}
                >
                  {CATEGORIAS.map(c => (
                    <option key={c.key} value={c.key} className="bg-slate-800 text-white">{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              </div>
            </div>

            {/* Canal */}
            <div>
              <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Canal de pago</label>
              <div className="flex gap-2">
                {CANALES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setEntrada(prev => prev ? { ...prev, canal: c.key as EntradaParsed['canal'] } : prev)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      entrada.canal === c.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/8 text-white/40 hover:bg-white/12'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Alumna (read-only, shows match result) */}
            {entrada.alumna_nombre && (
              <div>
                <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Alumna detectada</label>
                <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-sm text-white flex-1">{entrada.alumna_nombre}</span>
                  {entrada.alumna_id
                    ? <span className="text-emerald-400 text-xs font-medium">✓ Vinculada</span>
                    : <span className="text-amber-400 text-xs font-medium">Sin registro</span>
                  }
                </div>
              </div>
            )}

            {/* Fecha */}
            <div>
              <label className="block text-white/40 text-[11px] mb-1.5 uppercase tracking-widest">Fecha</label>
              <input
                type="date"
                className="w-full bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>

            {/* Acciones */}
            <div className="flex gap-3 mt-2 pb-4">
              <button
                onClick={reiniciar}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/8 text-white/60 text-sm font-medium hover:bg-white/12 transition active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Repetir
              </button>
              <button
                onClick={guardar}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition active:scale-95 shadow-lg shadow-blue-900/40"
              >
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        )}

        {/* ── GUARDANDO ── */}
        {estado === 'guardando' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
            <p className="text-white/60 text-sm">Guardando en caja…</p>
          </div>
        )}

        {/* ── ÉXITO ── */}
        {estado === 'exito' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
            <CheckCircle2 className="w-24 h-24 text-emerald-400" />
            <div>
              <p className="text-white font-semibold text-xl">¡Registrado!</p>
              {entrada && (
                <p className="text-white/50 text-sm mt-2">
                  ${entrada.monto.toLocaleString('es-MX')} · {entrada.concepto}
                </p>
              )}
            </div>
            <button
              onClick={reiniciar}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base transition active:scale-95 shadow-lg shadow-blue-900/40"
            >
              Nuevo movimiento
            </button>
          </div>
        )}

        {/* ── ERROR ── */}
        {estado === 'error' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
            <AlertCircle className="w-20 h-20 text-red-400" />
            <div>
              <p className="text-white font-semibold text-lg">Algo salió mal</p>
              <p className="text-white/50 text-sm mt-2 leading-relaxed">{errorMsg}</p>
            </div>
            <button
              onClick={reiniciar}
              className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium text-base transition active:scale-95"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
