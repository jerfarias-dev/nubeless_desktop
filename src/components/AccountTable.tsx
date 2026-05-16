import { useState } from 'react'
import {
  Copy, Eye, EyeOff, Star, ExternalLink,
  Pencil, Trash2, Lock, X, Check, AlertTriangle, Repeat
} from 'lucide-react'
import { useStore } from '../store/useStore'
import TotpCodeCell from './TotpCodeCell'
import { computeAccountHealth, type AccountHealth } from '../utils/passwordHealth'
import type { Account } from '../types/electron'

interface Props {
  onEdit(account: Account): void
}

// Delete confirmation dialog with master password verification
function DeleteConfirmDialog({
  account,
  onConfirm,
  onCancel
}: {
  account: Account
  onConfirm(): void
  onCancel(): void
}) {
  const [step, setStep]         = useState<'confirm' | 'verify'>('confirm')
  const [masterPwd, setMasterPwd] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  const handleFirstConfirm = () => setStep('verify')

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const ok = await window.electronAPI.auth.verifyPassword(masterPwd)
      if (ok) {
        onConfirm()
      } else {
        setError('Contraseña incorrecta')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface-card p-6 shadow-2xl ring-1 ring-white/10">
        {step === 'confirm' ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-white">Eliminar cuenta</h3>
            <p className="mb-4 text-sm text-slate-400">
              ¿Eliminar <span className="text-white font-medium">{account.platform}</span>
              {' '}({account.username})? Esta acción es irreversible.
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={handleFirstConfirm} className="flex-1 rounded-lg bg-red-500/80 py-2 text-sm font-medium text-white hover:bg-red-500">
                Continuar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Lock className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-white">Verificar identidad</h3>
            <p className="mb-3 text-sm text-slate-400">
              Ingresa tu contraseña maestra para confirmar la eliminación.
            </p>
            <div className="relative mb-3">
              <input
                type={showPwd ? 'text' : 'password'}
                value={masterPwd}
                onChange={e => setMasterPwd(e.target.value)}
                placeholder="Contraseña maestra"
                autoFocus
                className="w-full rounded-lg bg-surface-input px-3 py-2 pr-10 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400 hover:bg-white/10">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-500/80 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                {loading ? 'Verificando…' : 'Eliminar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** Iconos informativos de salud — no bloquean nada, solo avisan visualmente. */
function HealthBadges({ health }: { health?: AccountHealth }) {
  if (!health || (!health.isWeak && !health.isDuplicate)) {
    return <span className="text-slate-700">—</span>
  }
  return (
    <div className="flex items-center justify-center gap-1.5">
      {health.isWeak && (
        <span
          title="Contraseña débil — corta o sin variedad. Considera reemplazarla."
          className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-400"
        >
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}
      {health.isDuplicate && (
        <span
          title={`Esta contraseña se repite en ${health.duplicateCount} cuentas. Cambia las duplicadas para mayor seguridad.`}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-red-400"
        >
          <Repeat className="h-3 w-3" />
        </span>
      )}
    </div>
  )
}

export default function AccountTable({ onEdit }: Props) {
  const { filteredAccounts, categories, deleteAccount, copyToClipboard, accounts: allAccounts } = useStore()
  const accounts = filteredAccounts()

  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set())
  const [deletingAccount, setDeletingAccount]   = useState<Account | null>(null)

  const catMap = new Map(categories.map(c => [c.id, c]))
  // Health se computa sobre TODAS las cuentas (no las filtradas) para que la
  // detección de duplicados sea global, no solo del subset visible.
  const healthMap = computeAccountHealth(allAccounts)

  const togglePwd = (id: number) => {
    setVisiblePasswords(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleConfirmDelete = async () => {
    if (!deletingAccount) return
    await deleteAccount(deletingAccount.id)
    setDeletingAccount(null)
    useStore.getState().setStatus({ text: 'Cuenta eliminada', type: 'info' })
  }

  const openUrl = (url: string) => {
    const href = url.startsWith('http') ? url : `https://${url}`
    window.electronAPI.shell.openExternal(href)
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
        <Lock className="mb-3 h-12 w-12 text-slate-700" />
        <p className="text-slate-500">No hay cuentas que coincidan con los filtros</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Plataforma</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Contraseña</th>
              <th className="px-4 py-3 text-center">Salud</th>
              <th className="px-4 py-3">2FA</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-center">URL</th>
              <th className="px-4 py-3 text-center">Fav</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => {
              const cat = catMap.get(account.category_id)
              const pwdVisible = visiblePasswords.has(account.id)
              return (
                <tr
                  key={account.id}
                  className="group border-b border-white/5 transition hover:bg-white/5"
                >
                  {/* Platform */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{account.platform}</span>
                  </td>

                  {/* Username */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-slate-300">{account.username}</span>
                      <button
                        onClick={() => copyToClipboard(account.username, 'Usuario')}
                        className="rounded p-0.5 text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100"
                        title="Copiar usuario"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Password */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-slate-300">
                        {pwdVisible ? account.password : '••••••••'}
                      </span>
                      <button
                        onClick={() => togglePwd(account.id)}
                        className="rounded p-0.5 text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100"
                        title={pwdVisible ? 'Ocultar' : 'Mostrar'}
                      >
                        {pwdVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(account.password, 'Contraseña')}
                        className="rounded p-0.5 text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100"
                        title="Copiar contraseña"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Salud — badges no-bloqueantes */}
                  <td className="px-4 py-3 text-center">
                    <HealthBadges health={healthMap.get(account.id)} />
                  </td>

                  {/* TOTP code — solo si la cuenta tiene secreto */}
                  <td className="px-4 py-3">
                    {account.totp_secret
                      ? <TotpCodeCell
                          secret={account.totp_secret}
                          onCopy={code => copyToClipboard(code, 'Código 2FA')}
                        />
                      : <span className="text-slate-700">—</span>
                    }
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    {cat && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </span>
                    )}
                  </td>

                  {/* URL */}
                  <td className="px-4 py-3 text-center">
                    {account.url ? (
                      <button
                        onClick={() => openUrl(account.url)}
                        className="rounded p-1 text-slate-500 hover:text-accent"
                        title={account.url}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>

                  {/* Favorite */}
                  <td className="px-4 py-3 text-center">
                    {account.is_favorite ? (
                      <Star className="inline h-4 w-4 fill-amber-400 text-amber-400" />
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="max-w-[140px] px-4 py-3">
                    <span className="block truncate text-xs text-slate-500" title={account.notes}>
                      {account.notes || '—'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => onEdit(account)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingAccount(account)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deletingAccount && (
        <DeleteConfirmDialog
          account={deletingAccount}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingAccount(null)}
        />
      )}
    </>
  )
}
