import { useState, useEffect, useCallback } from 'react'
import {
  X, KeyRound, Eye, EyeOff, ShieldCheck, AlertTriangle, Loader2
} from 'lucide-react'
import PasswordStrength from './PasswordStrength'
import type { PasswordStrength as PWStrength } from '../types/electron'

interface Props {
  onClose(): void
  onSuccess(): void
}

type Status = 'form' | 'saving' | 'success' | 'error'

/**
 * Modal para cambiar la contraseña maestra.
 *
 * Pide la vieja + la nueva (con confirmación) y delega en
 * `electronAPI.auth.changeMasterPassword`. Antes de ejecutar muestra al
 * usuario que se va a tomar un backup defensivo y que la operación no
 * se debe interrumpir.
 */
export default function ChangeMasterPasswordDialog({ onClose, onSuccess }: Props) {
  const [status, setStatus] = useState<Status>('form')

  const [oldPwd, setOldPwd]         = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showOld, setShowOld]       = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [strength, setStrength]     = useState<PWStrength | null>(null)
  const [error, setError]           = useState<string | null>(null)

  // Evaluador de fortaleza con debounce para no llamar IPC en cada tecla
  useEffect(() => {
    if (!newPwd) { setStrength(null); return }
    const t = setTimeout(async () => {
      try {
        const s = await window.electronAPI.generator.evaluate(newPwd)
        setStrength(s)
      } catch { /* swallow */ }
    }, 200)
    return () => clearTimeout(t)
  }, [newPwd])

  const validate = useCallback((): string | null => {
    if (!oldPwd) return 'Ingresa tu contraseña actual'
    if (newPwd.length < 8) return 'La contraseña nueva debe tener al menos 8 caracteres'
    if (newPwd === oldPwd) return 'La contraseña nueva debe ser distinta de la actual'
    if (newPwd !== confirm) return 'La confirmación no coincide'
    return null
  }, [oldPwd, newPwd, confirm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setStatus('saving')
    try {
      const result = await window.electronAPI.auth.changeMasterPassword(oldPwd, newPwd)
      if (!result.ok) {
        setError('Contraseña actual incorrecta')
        setStatus('form')
        return
      }
      setStatus('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar la contraseña')
      setStatus('error')
    }
  }

  // Limpia los campos sensibles al cerrar
  const handleClose = () => {
    setOldPwd(''); setNewPwd(''); setConfirm('')
    onClose()
  }

  const handleSuccessClose = () => {
    setOldPwd(''); setNewPwd(''); setConfirm('')
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      onClick={status === 'saving' ? undefined : handleClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-surface-card ring-1 ring-border"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold text-primary">
              Cambiar contraseña maestra
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={status === 'saving'}
            className="rounded-lg p-1.5 text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ────── Form ────── */}
        {(status === 'form' || status === 'error') && (
          <form onSubmit={handleSubmit} className="space-y-3 p-5">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Antes de continuar
              </p>
              <ul className="ml-5 list-disc space-y-1 text-amber-100/80">
                <li>Se creará un <strong>backup automático</strong> antes del cambio.</li>
                <li>Asegúrate de recordar la nueva contraseña — no se puede recuperar.</li>
                <li>No cierres la app durante el proceso.</li>
              </ul>
            </div>

            <PasswordField
              label="Contraseña actual"
              value={oldPwd}
              onChange={setOldPwd}
              show={showOld}
              onToggleShow={() => setShowOld(v => !v)}
              autoFocus
            />

            <PasswordField
              label="Contraseña nueva"
              value={newPwd}
              onChange={setNewPwd}
              show={showNew}
              onToggleShow={() => setShowNew(v => !v)}
            />

            {strength && (
              <div className="pl-1">
                <PasswordStrength strength={strength} />
              </div>
            )}

            <PasswordField
              label="Confirmar contraseña nueva"
              value={confirm}
              onChange={setConfirm}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(v => !v)}
            />

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-surface-input px-4 py-2 text-sm text-secondary hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-primary hover:bg-accent-hover"
              >
                Cambiar contraseña
              </button>
            </div>
          </form>
        )}

        {/* ────── Saving ────── */}
        {status === 'saving' && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
            <p className="text-sm font-medium text-primary">Re-cifrando bóveda…</p>
            <p className="text-xs text-muted">
              Esto puede tardar unos segundos. No cierres la app.
            </p>
          </div>
        )}

        {/* ────── Success ────── */}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
              <ShieldCheck className="h-7 w-7 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-primary">¡Contraseña cambiada!</h3>
            <p className="text-sm text-secondary">
              Tu bóveda fue re-cifrada con la nueva contraseña. La sesión actual sigue activa.
            </p>
            <button
              onClick={handleSuccessClose}
              className="mt-2 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-primary hover:bg-accent-hover"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: campo de contraseña con botón de mostrar/ocultar
// ─────────────────────────────────────────────────────────────────────────────
function PasswordField({
  label, value, onChange, show, onToggleShow, autoFocus,
}: {
  label: string
  value: string
  onChange(v: string): void
  show: boolean
  onToggleShow(): void
  autoFocus?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          className="w-full rounded-lg bg-surface-input py-2 pl-3 pr-10 text-sm text-primary placeholder-muted outline-none ring-1 ring-border focus:ring-accent"
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-secondary"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
