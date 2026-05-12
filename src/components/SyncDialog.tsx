import { useState, useEffect, useCallback } from 'react'
import QRCode from 'react-qr-code'
import { X, Smartphone, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react'
import type { SyncEventType } from '../types/electron'

interface Props {
  onClose(): void
}

type SyncStatus = 'loading' | 'waiting' | 'connected' | 'success' | 'expired' | 'error'

export default function SyncDialog({ onClose }: Props) {
  const [status, setStatus]       = useState<SyncStatus>('loading')
  const [qrData, setQrData]       = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState(0)
  const [secondsLeft, setSeconds] = useState(120)
  const [transferred, setTransferred] = useState(0)
  const [errorMsg, setErrorMsg]   = useState('')

  const startSync = useCallback(async () => {
    setStatus('loading')
    try {
      const { qrData: qr, expiresAt: exp } = await window.electronAPI.sync.start()
      setQrData(qr)
      setExpiresAt(exp)
      setSeconds(Math.round((exp - Date.now()) / 1000))
      setStatus('waiting')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error al iniciar sincronización')
    }
  }, [])

  // Arrancar sync al montar
  useEffect(() => {
    startSync()
    const unsub = window.electronAPI.sync.onEvent((event: SyncEventType) => {
      if (event.type === 'connected')   setStatus('connected')
      if (event.type === 'transferred') { setTransferred(event.count); setStatus('success') }
      if (event.type === 'expired')     setStatus('expired')
      if (event.type === 'error')       { setStatus('error'); setErrorMsg(event.message) }
    })
    return () => { unsub?.(); window.electronAPI.sync.stop() }
  }, [startSync])

  // Countdown
  useEffect(() => {
    if (status !== 'waiting' && status !== 'connected') return
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
      setSeconds(s)
      if (s === 0) setStatus('expired')
    }, 1000)
    return () => clearInterval(t)
  }, [status, expiresAt])

  const pct = Math.round((secondsLeft / 120) * 100)
  const timerColor = secondsLeft > 60 ? '#22c55e' : secondsLeft > 30 ? '#eab308' : '#ef4444'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-card shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Smartphone className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold text-white">Sincronizar con móvil</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 text-center">
          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-accent" />
              <p className="text-sm text-slate-400">Iniciando servidor local…</p>
            </div>
          )}

          {/* Waiting / Connected — mostrar QR */}
          {(status === 'waiting' || status === 'connected') && qrData && (
            <>
              <p className="mb-4 text-sm text-slate-400">
                {status === 'waiting'
                  ? 'Escanea el código QR con la app móvil'
                  : 'Móvil conectado — transfiriendo…'}
              </p>

              {/* QR con borde de color */}
              <div
                className="mx-auto inline-block rounded-2xl p-3 transition-all"
                style={{ backgroundColor: '#fff', boxShadow: `0 0 0 4px ${status === 'connected' ? '#22c55e' : '#6366f1'}40` }}
              >
                <QRCode value={qrData} size={200} bgColor="#ffffff" fgColor="#0f172a" />
              </div>

              {/* Countdown ring */}
              <div className="mt-5 flex items-center justify-center gap-2">
                <div className="relative h-9 w-9">
                  <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15" fill="none"
                      stroke={timerColor} strokeWidth="3"
                      strokeDasharray={`${2 * Math.PI * 15}`}
                      strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
                      className="transition-all"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: timerColor }}>
                    {secondsLeft}s
                  </span>
                </div>
                <span className="text-sm text-slate-400">
                  {status === 'connected' ? 'Transfiriendo…' : 'Expira en'}
                </span>
              </div>

              {/* Info */}
              <p className="mt-4 text-xs text-slate-500">
                Ambos dispositivos deben estar en la <strong className="text-slate-400">misma red WiFi</strong>.
                La conexión es 100% local.
              </p>
            </>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-9 w-9 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">¡Sincronización exitosa!</h3>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-white">{transferred}</span> cuentas transferidas al móvil.
              </p>
              <button
                onClick={onClose}
                className="mt-2 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Expired */}
          {status === 'expired' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
                <Clock className="h-9 w-9 text-amber-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Código expirado</h3>
              <p className="text-sm text-slate-400">El QR es válido 2 minutos por seguridad.</p>
              <button
                onClick={startSync}
                className="mt-2 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Generar nuevo QR
              </button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                <AlertCircle className="h-9 w-9 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Error</h3>
              <p className="text-sm text-slate-400">{errorMsg}</p>
              <button
                onClick={startSync}
                className="mt-2 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
