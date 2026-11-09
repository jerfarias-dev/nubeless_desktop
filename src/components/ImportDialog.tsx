import { useState } from 'react'
import { X, FileUp, AlertCircle, CheckCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ImportPreview } from '../types/electron'

interface Props {
  onClose(): void
}

/** Importar de Bitwarden, 1Password, Chrome/Edge, Firefox, KeePass o CSV de Nubeless. */
export default function ImportDialog({ onClose }: Props) {
  const { categories, loadAccounts, loadCategories, setStatus } = useStore()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'source' | 'fixed'>('source')
  const [categoryId, setCategoryId] = useState<number>(
    categories.find(c => c.name === 'Sin categoría')?.id ?? categories[0]?.id ?? 1
  )
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  const pickFile = async () => {
    setError('')
    const path = await window.electronAPI.dialog.openFile([
      { name: 'Exportación de gestor de contraseñas', extensions: ['csv', 'json'] },
    ])
    if (!path) return
    setBusy(true)
    try {
      const p = await window.electronAPI.vault.importPreview(path)
      setFilePath(path)
      setPreview(p)
      if (p.sourceCategories.length === 0) setCategoryMode('fixed')
    } catch (e) {
      setPreview(null)
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!filePath) return
    setBusy(true)
    try {
      const r = await window.electronAPI.vault.importRun(filePath, { categoryMode, categoryId, skipDuplicates })
      await Promise.all([loadAccounts(), loadCategories()])
      const extra = r.skippedDuplicates ? `, ${r.skippedDuplicates} duplicadas omitidas` : ''
      setStatus({ text: `${r.imported} cuentas importadas${extra}`, type: 'success' })
      onClose()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const toImport = preview ? preview.total - (skipDuplicates ? preview.duplicates : 0) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-card shadow-2xl ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">Importar contraseñas</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-secondary hover:bg-surface-hover hover:text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-secondary">
            Admite exportaciones de <b>Bitwarden</b> (JSON sin cifrar o CSV), <b>1Password</b>,
            <b> Chrome / Edge / Brave</b>, <b>Firefox</b>, <b>KeePass / KeePassXC</b> (CSV) y CSV de Nubeless.
          </p>
          <p className="text-xs text-amber-300">
            Esos archivos guardan tus contraseñas sin cifrar: bórralos (y vacía la papelera del sistema) después de importar.
          </p>

          <button
            onClick={pickFile}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-secondary hover:bg-surface-hover hover:text-primary"
          >
            <FileUp className="h-4 w-4" />
            {filePath ? 'Elegir otro archivo' : 'Elegir archivo…'}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="rounded-lg bg-surface-input px-4 py-3 text-sm">
                <p className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-4 w-4 text-green-400" /> Formato: {preview.formatLabel}
                </p>
                <ul className="mt-2 space-y-0.5 text-secondary">
                  <li>{preview.total} cuentas con contraseña ({preview.withTotp} con 2FA)</li>
                  {preview.duplicates > 0 && <li>{preview.duplicates} ya existen en tu bóveda</li>}
                  {preview.skipped > 0 && (
                    <li className="text-muted">
                      {preview.skipped} registros sin contraseña (notas, tarjetas…) no se importan por ahora
                    </li>
                  )}
                </ul>
              </div>

              <div>
                <label className="field-label">Categoría</label>
                <div className="space-y-2 text-sm text-secondary">
                  {preview.sourceCategories.length > 0 && (
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={categoryMode === 'source'} onChange={() => setCategoryMode('source')} />
                      Usar las carpetas del archivo ({preview.sourceCategories.length}; se crean si no existen)
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={categoryMode === 'fixed'} onChange={() => setCategoryMode('fixed')} />
                    Poner todas en
                    <select
                      value={categoryId}
                      onChange={e => { setCategoryId(Number(e.target.value)); setCategoryMode('fixed') }}
                      className="rounded-lg bg-surface-input px-2 py-1 text-sm"
                    >
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {preview.duplicates > 0 && (
                <label className="flex items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} />
                  Omitir las que ya existen (misma plataforma y usuario)
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            onClick={runImport}
            disabled={!preview || busy || toImport === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            {preview ? `Importar ${toImport}` : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Los errores del IPC llegan como "Error invoking remote method '...': Error: <msg>". */
function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
