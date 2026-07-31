import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import type { TotpCode } from '../types/electron'

interface Props {
  secret: string
  onCopy(code: string): void
}

/**
 * Muestra el código TOTP actual de un secreto y se auto-actualiza al rotar.
 *
 * Estrategia de timer:
 *  1. Llama a `totp:generate` que devuelve { code, secondsRemaining }.
 *  2. Cuenta hacia atrás cada segundo localmente.
 *  3. Cuando `secondsRemaining` llega a 0, vuelve a llamar al IPC.
 *
 * Ventaja: una sola llamada IPC por ventana de 30s (en lugar de cada segundo).
 */
export default function TotpCodeCell({ secret, onCopy }: Props) {
  const [data, setData]     = useState<TotpCode | null>(null)
  const [seconds, setSeconds] = useState<number>(30)
  const [error, setError]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCode = async () => {
    try {
      const code = await window.electronAPI.totp.generate(secret)
      setData(code)
      setSeconds(code.secondsRemaining)
      setError(false)
    } catch {
      setError(true)
    }
  }

  // Fetch inicial cuando cambia el secreto
  useEffect(() => {
    if (!secret) return
    fetchCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret])

  // Tick local — cuenta atrás cada segundo, re-fetch al llegar a 0
  useEffect(() => {
    if (!data) return
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          fetchCode()
          return data.stepSeconds
        }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.code])

  if (error) {
    return <span className="font-mono text-xs text-red-400">inválido</span>
  }
  if (!data) {
    return <span className="font-mono text-xs text-muted">…</span>
  }

  // Formatea "123456" como "123 456" para legibilidad
  const formatted = `${data.code.slice(0, 3)} ${data.code.slice(3)}`
  const pct = Math.round((seconds / data.stepSeconds) * 100)
  const color = seconds > 10 ? '#22c55e' : seconds > 5 ? '#eab308' : '#ef4444'

  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mono text-xs font-semibold tabular-nums tracking-wider"
        style={{ color }}
      >
        {formatted}
      </span>
      {/* Mini barra de progreso */}
      <div className="h-1 w-8 overflow-hidden rounded-full bg-border">
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <button
        onClick={() => onCopy(data.code)}
        className="rounded p-0.5 text-muted opacity-0 transition hover:text-secondary group-hover:opacity-100"
        title="Copiar código TOTP"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
