import { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useStore } from '../store/useStore'
import WinTitleBar from '../components/WinTitleBar'

const isWin = window.electronAPI.platform === 'win32'

export default function LoginPage() {
  const { isFirstTime, login, createMaster } = useStore()

  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  useEffect(() => { setError(''); setPassword(''); setConfirm('') }, [isFirstTime])

  const validate = (): string | null => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
    if (isFirstTime && password !== confirm) return 'Las contraseñas no coinciden'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      if (isFirstTime) {
        await createMaster(password)
      } else {
        const ok = await login(password)
        if (!ok) setError('Contraseña incorrecta')
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {isWin && <WinTitleBar />}
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20">
            <ShieldCheck className="h-9 w-9 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-primary">Nubeless</h1>
          <p className="mt-1 text-sm text-secondary">
            {isFirstTime ? 'Crea tu contraseña maestra para comenzar' : 'Ingresa tu contraseña maestra'}
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-surface-card p-8 shadow-2xl ring-1 ring-border"
        >
          <div className="space-y-4">
            {/* Password field */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-secondary">
                {isFirstTime ? 'Nueva contraseña maestra' : 'Contraseña maestra'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  className="w-full rounded-lg bg-surface-input py-2.5 pl-10 pr-10 text-sm text-primary placeholder-muted outline-none ring-1 ring-border focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm field (first time only) */}
            {isFirstTime && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-secondary">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg bg-surface-input py-2.5 pl-10 pr-10 text-sm text-primary placeholder-muted outline-none ring-1 ring-border focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-primary transition hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Procesando…' : isFirstTime ? 'Crear bóveda' : 'Desbloquear'}
            </button>
          </div>

          {/* Hint for first time */}
          {isFirstTime && (
            <p className="mt-4 text-center text-xs text-muted">
              Mínimo 8 caracteres. Esta contraseña no se puede recuperar.
            </p>
          )}
        </form>
      </div>
      </div>
    </div>
  )
}
