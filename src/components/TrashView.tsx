import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Account } from '../types/electron'

/** Días que se muestran las cuentas borradas. Debe coincidir con TRASH_DAYS
 *  de electron/ipc/accounts.ts (ahí se filtra). */
const TRASH_DAYS = 30

function daysLeft(deletedAt: string | null | undefined): number {
  if (!deletedAt) return TRASH_DAYS
  const elapsed = (Date.now() - Date.parse(deletedAt)) / 86_400_000
  return Math.max(0, Math.ceil(TRASH_DAYS - elapsed))
}

export default function TrashView() {
  const { setStatus, loadAccounts } = useStore()
  const [items, setItems] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await window.electronAPI.accounts.getTrash())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const restore = async (a: Account) => {
    try {
      await window.electronAPI.accounts.restore(a.id)
      await loadAccounts()
      await reload()
      setStatus({ text: `"${a.platform}" restaurada`, type: 'success' })
    } catch {
      setStatus({ text: 'No se pudo restaurar la cuenta', type: 'error' })
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <p className="mb-4 text-sm text-muted">
        Las cuentas borradas se pueden restaurar durante {TRASH_DAYS} días. Al restaurar,
        la cuenta también vuelve en el móvil en la próxima sincronización.
      </p>

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted">
          <Trash2 className="h-8 w-8" />
          <p className="text-sm">La papelera está vacía</p>
        </div>
      )}

      <ul className="space-y-2">
        {items.map(a => (
          <li key={a.id} className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-3">
            <div>
              <p className="text-sm font-medium text-primary">{a.platform}</p>
              <p className="text-xs text-muted">
                {a.username} · se oculta en {daysLeft(a.deleted_at)} día{daysLeft(a.deleted_at) === 1 ? '' : 's'}
              </p>
            </div>
            <button
              onClick={() => restore(a)}
              className="flex items-center gap-2 rounded-lg bg-accent/20 px-3 py-1.5 text-sm text-primary transition hover:bg-accent/30"
            >
              <RotateCcw className="h-4 w-4" /> Restaurar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
