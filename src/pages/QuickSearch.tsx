import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, KeyRound, User, ShieldCheck } from 'lucide-react'
import { useSettings } from '../store/useSettings'
import type { Account } from '../types/electron'

const MAX_RESULTS = 8
const isMac = window.electronAPI.platform === 'darwin'

/**
 * Ventana de búsqueda rápida (ruta #quick). La abre el atajo global
 * Ctrl/Cmd+Shift+Espacio. Enter copia la contraseña, Shift+Enter el usuario y
 * Alt+Enter el código 2FA; después la ventana se oculta. El borrado del
 * portapapeles a los 15 s lo hace el proceso main.
 */
export default function QuickSearch() {
  const theme = useSettings(s => s.theme)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const reload = useCallback(async () => {
    setQuery('')
    setSelected(0)
    setError('')
    try {
      setAccounts(await window.electronAPI.accounts.getAll())
    } catch {
      // La bóveda se bloqueó entre tanto: no mostramos nada
      setAccounts([])
      setError('La bóveda está bloqueada')
    }
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    void reload()
    return window.electronAPI.quick.onOpen(() => { void reload() })
  }, [reload])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? accounts.filter(a =>
          a.platform.toLowerCase().includes(q) ||
          a.username.toLowerCase().includes(q) ||
          a.url.toLowerCase().includes(q))
      : accounts.filter(a => a.is_favorite)
    return list.slice(0, MAX_RESULTS)
  }, [accounts, query])

  useEffect(() => { setSelected(0) }, [query])

  const copy = async (a: Account, what: 'password' | 'username' | 'totp') => {
    let text = what === 'password' ? a.password : a.username
    if (what === 'totp') {
      if (!a.totp_secret) return
      text = (await window.electronAPI.totp.generate(a.totp_secret)).code
    }
    await window.electronAPI.clipboard.copySecret(text)
    await window.electronAPI.quick.hide()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { void window.electronAPI.quick.hide(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[selected]) {
      e.preventDefault()
      void copy(results[selected], e.altKey ? 'totp' : e.shiftKey ? 'username' : 'password')
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary" onKeyDown={onKeyDown}>
      <div className="drag-region flex items-center gap-3 border-b border-border px-4 py-3">
        <Search className="h-5 w-5 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar cuenta…"
          className="no-drag flex-1 bg-transparent text-base text-primary outline-none placeholder:text-muted"
        />
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {error && <li className="px-3 py-6 text-center text-sm text-muted">{error}</li>}
        {!error && results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            {query ? 'Sin resultados' : 'Escribe para buscar (sin texto se muestran tus favoritas)'}
          </li>
        )}
        {results.map((a, i) => (
          <li key={a.id}>
            <div
              onMouseEnter={() => setSelected(i)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${i === selected ? 'bg-accent/20' : ''}`}
            >
              <button onClick={() => copy(a, 'password')} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-primary">{a.platform}</p>
                <p className="truncate text-xs text-muted">{a.username}</p>
              </button>
              <div className="flex shrink-0 gap-1">
                <button title="Copiar usuario" onClick={() => copy(a, 'username')} className="rounded p-1.5 text-muted hover:bg-surface-hover hover:text-primary">
                  <User className="h-4 w-4" />
                </button>
                <button title="Copiar contraseña" onClick={() => copy(a, 'password')} className="rounded p-1.5 text-muted hover:bg-surface-hover hover:text-primary">
                  <KeyRound className="h-4 w-4" />
                </button>
                {a.totp_secret && (
                  <button title="Copiar código 2FA" onClick={() => copy(a, 'totp')} className="rounded p-1.5 text-muted hover:bg-surface-hover hover:text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <footer className="border-t border-border px-4 py-2 text-[11px] text-muted">
        Enter: contraseña · Shift+Enter: usuario · {isMac ? '⌥' : 'Alt'}+Enter: 2FA · Esc: cerrar · se borra del portapapeles en 15 s
      </footer>
    </div>
  )
}
