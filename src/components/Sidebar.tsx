import { useState } from 'react'
import {
  ShieldCheck, LogOut, Download, Upload,
  FileDown, FileUp, Settings, Tags, ChevronDown, ChevronRight, Smartphone,
  AlertTriangle, Repeat
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { summarizeHealth } from '../utils/passwordHealth'

interface Props {
  onManageCategories(): void
  onSync(): void
  onOpenSettings(): void
}

const isMac = window.electronAPI.platform === 'darwin'
const isWin = window.electronAPI.platform === 'win32'

export default function Sidebar({ onManageCategories, onSync, onOpenSettings }: Props) {
  const { logout, accounts, categories, setStatus } = useStore()
  const [vaultOpen, setVaultOpen] = useState(false)

  const handleExportEnc = async () => {
    const path = await window.electronAPI.dialog.saveFile([
      { name: 'Encrypted Vault', extensions: ['enc'] }
    ])
    if (!path) return
    try {
      await window.electronAPI.vault.exportEncrypted(path)
      setStatus({ text: 'Bóveda exportada correctamente', type: 'success' })
    } catch {
      setStatus({ text: 'Error al exportar bóveda', type: 'error' })
    }
  }

  const handleImportEnc = async () => {
    const path = await window.electronAPI.dialog.openFile([
      { name: 'Encrypted Vault', extensions: ['enc'] }
    ])
    if (!path) return
    try {
      const count = await window.electronAPI.vault.importEncrypted(path)
      await useStore.getState().loadAccounts()
      setStatus({ text: `${count} cuentas importadas`, type: 'success' })
    } catch {
      setStatus({ text: 'Error al importar bóveda', type: 'error' })
    }
  }

  const handleExportCSV = async () => {
    const path = await window.electronAPI.dialog.saveFile([
      { name: 'CSV', extensions: ['csv'] }
    ])
    if (!path) return
    try {
      const count = await window.electronAPI.vault.exportCSV(path, true)
      setStatus({ text: `${count} cuentas exportadas (contraseñas ocultas)`, type: 'success' })
    } catch {
      setStatus({ text: 'Error al exportar CSV', type: 'error' })
    }
  }

  const handleImportCSV = async () => {
    const path = await window.electronAPI.dialog.openFile([
      { name: 'CSV', extensions: ['csv'] }
    ])
    if (!path) return
    try {
      const count = await window.electronAPI.vault.importCSV(path)
      await useStore.getState().loadAccounts()
      setStatus({ text: `${count} cuentas importadas desde CSV`, type: 'success' })
    } catch {
      setStatus({ text: 'Error al importar CSV', type: 'error' })
    }
  }

  const totalFavs = accounts.filter(a => a.is_favorite).length
  const health = summarizeHealth(accounts)

  return (
    <aside className="flex h-full w-56 flex-col bg-surface-card">
      {/* Logo — drag region para arrastrar la ventana */}
      <div className={`drag-region flex items-center gap-2.5 border-b border-white/5 px-4 ${isMac ? 'pt-8 pb-3' : isWin ? 'py-3' : 'py-4'}`}>
        <ShieldCheck className="no-drag h-6 w-6 text-accent" />
        <span className="no-drag font-semibold text-white">Password Mgr</span>
      </div>

      {/* Stats */}
      <div className="border-b border-white/5 px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-input px-3 py-2 text-center">
            <p className="text-lg font-bold text-white">{accounts.length}</p>
            <p className="text-xs text-slate-500">Cuentas</p>
          </div>
          <div className="rounded-lg bg-surface-input px-3 py-2 text-center">
            <p className="text-lg font-bold text-amber-400">{totalFavs}</p>
            <p className="text-xs text-slate-500">Favoritas</p>
          </div>
        </div>

        {/* Salud — solo aparece si hay algo que reportar */}
        {(health.weak > 0 || health.duplicated > 0) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {health.weak > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5"
                title={`${health.weak} contraseñas son débiles (cortas o sin variedad)`}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300">{health.weak} débiles</span>
              </div>
            )}
            {health.duplicated > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5"
                title={`${health.duplicated} cuentas usan contraseñas duplicadas`}
              >
                <Repeat className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs font-medium text-red-300">{health.duplicated} repetidas</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Categories */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Categorías
        </p>
        {categories.map(cat => {
          const count = accounts.filter(a => a.category_id === cat.id).length
          return (
            <button
              key={cat.id}
              onClick={() => useStore.getState().setFilter('categoryId',
                useStore.getState().filters.categoryId === cat.id ? null : cat.id
              )}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition ${
                useStore.getState().filters.categoryId === cat.id
                  ? 'bg-accent/20 text-white'
                  : 'text-slate-400 hover:bg-surface-hover hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </span>
              <span className="text-xs text-slate-500">{count}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/5 px-3 py-3 space-y-1">
        {/* Vault submenu */}
        <button
          onClick={() => setVaultOpen(v => !v)}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-surface-hover hover:text-white"
        >
          <span className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Bóveda
          </span>
          {vaultOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {vaultOpen && (
          <div className="ml-3 space-y-0.5 border-l border-white/10 pl-3">
            <button onClick={handleExportEnc} className="sidebar-sub-btn">
              <Download className="h-3.5 w-3.5" /> Exportar .enc
            </button>
            <button onClick={handleImportEnc} className="sidebar-sub-btn">
              <Upload className="h-3.5 w-3.5" /> Importar .enc
            </button>
            <button onClick={handleExportCSV} className="sidebar-sub-btn">
              <FileDown className="h-3.5 w-3.5" /> Exportar CSV
            </button>
            <button onClick={handleImportCSV} className="sidebar-sub-btn">
              <FileUp className="h-3.5 w-3.5" /> Importar CSV
            </button>
          </div>
        )}

        <button
          onClick={onSync}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-surface-hover hover:text-white"
        >
          <Smartphone className="h-4 w-4" />
          Sincronizar móvil
        </button>

        <button
          onClick={onManageCategories}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-surface-hover hover:text-white"
        >
          <Tags className="h-4 w-4" />
          Categorías
        </button>

        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-surface-hover hover:text-white"
        >
          <Settings className="h-4 w-4" />
          Configuración
        </button>

        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
