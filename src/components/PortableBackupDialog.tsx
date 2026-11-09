import { useState } from 'react'
import { X, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useStore } from '../store/useStore'

interface Props {
  mode: 'export' | 'import'
  onClose(): void
}

const MIN = 8

/** Respaldo portátil `.nubeless`: cifrado con una contraseña propia, se puede
 *  abrir en otro equipo o en el móvil. */
export default function PortableBackupDialog({ mode, onClose }: Props) {
  const { loadAccounts, loadCategories, setStatus } = useStore()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isExport = mode === 'export'
  const canSubmit = isExport ? pwd.length >= MIN && pwd === confirm : pwd.length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    setError('')
    const filters = [{ name: 'Respaldo de Nubeless', extensions: ['nubeless'] }]
    const path = isExport
      ? await window.electronAPI.dialog.saveFile(filters)
      : await window.electronAPI.dialog.openFile(filters)
    if (!path) return
    setBusy(true)
    try {
      if (isExport) {
        const n = await window.electronAPI.backup.exportPortable(path, pwd)
        setStatus({ text: `Respaldo guardado (${n} cuentas)`, type: 'success' })
      } else {
        const s = await window.electronAPI.backup.importPortable(path, pwd)
        await Promise.all([loadAccounts(), loadCategories()])
        setStatus({
          text: `Respaldo importado: ${s.added} nuevas, ${s.updated} actualizadas, ${s.deleted} borradas`,
          type: 'success',
        })
      }
      onClose()
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex)
      setError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-surface-card shadow-2xl ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">
            {isExport ? 'Exportar respaldo .nubeless' : 'Importar respaldo .nubeless'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-secondary hover:bg-surface-hover hover:text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-secondary">
            {isExport
              ? 'El archivo se cifra con una contraseña de respaldo (no la maestra). Con ella lo puedes abrir en otro equipo o en la app móvil. Si la olvidas, el respaldo no se puede recuperar.'
              : 'Las cuentas del respaldo se combinan con las tuyas: gana la versión más reciente de cada cuenta. Antes se guarda una copia de seguridad automática.'}
          </p>

          <div>
            <label className="field-label">Contraseña del respaldo</label>
            <div className="relative">
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                className="field-input pr-10"
              />
              <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isExport && pwd.length > 0 && pwd.length < MIN && (
              <p className="mt-1 text-xs text-amber-300">Mínimo {MIN} caracteres</p>
            )}
          </div>

          {isExport && (
            <div>
              <label className="field-label">Confirmar contraseña</label>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="field-input"
              />
              {confirm.length > 0 && confirm !== pwd && (
                <p className="mt-1 text-xs text-amber-300">No coinciden</p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? 'Procesando…' : isExport ? 'Elegir dónde guardar…' : 'Elegir archivo…'}
          </button>
        </div>
      </form>
    </div>
  )
}
