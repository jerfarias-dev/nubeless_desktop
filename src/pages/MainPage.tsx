import { useState } from 'react'
import { Plus, CheckCircle, Info, AlertCircle, Lock } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useSettings } from '../store/useSettings'
import Sidebar from '../components/Sidebar'
import SearchFilters from '../components/SearchFilters'
import AccountTable from '../components/AccountTable'
import AccountDialog from '../components/AccountDialog'
import CategoryManager from '../components/CategoryManager'
import SyncDialog from '../components/SyncDialog'
import SettingsDialog from '../components/SettingsDialog'
import WinTitleBar from '../components/WinTitleBar'
import { useIdleLock } from '../hooks/useIdleLock'
import type { Account } from '../types/electron'

const isWin = window.electronAPI.platform === 'win32'

export default function MainPage() {
  const { statusMessage, filteredAccounts, logout, isAuthenticated } = useStore()
  const autoLockMinutes = useSettings(s => s.autoLockMinutes)
  const accounts = filteredAccounts()

  // Auto-lock por inactividad — el timeout viene de las preferencias del usuario.
  // Si autoLockMinutes es 0, el usuario lo desactivó → enabled = false.
  const { secondsUntilLock, resetTimer } = useIdleLock(
    autoLockMinutes * 60 * 1000,
    () => { logout() },
    isAuthenticated && autoLockMinutes > 0
  )

  const [showAccountDialog, setShowAccountDialog] = useState(false)
  const [editingAccount, setEditingAccount]       = useState<Account | undefined>()
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showSyncDialog, setShowSyncDialog]           = useState(false)
  const [showSettings, setShowSettings]               = useState(false)

  const openCreate = () => { setEditingAccount(undefined); setShowAccountDialog(true) }
  const openEdit   = (a: Account) => { setEditingAccount(a); setShowAccountDialog(true) }
  const closeDialog = () => { setShowAccountDialog(false); setEditingAccount(undefined) }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-white">
      {/* Barra de título personalizada — solo Windows */}
      {isWin && <WinTitleBar />}

      {/* Contenido principal */}
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        onManageCategories={() => setShowCategoryManager(true)}
        onSync={() => setShowSyncDialog(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Aviso de auto-bloqueo en el último minuto — click extiende la sesión */}
        {secondsUntilLock !== null && secondsUntilLock > 0 && (
          <button
            onClick={resetTimer}
            className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25"
            title="Haz clic para extender la sesión"
          >
            <Lock className="h-3.5 w-3.5" />
            Bloqueo automático en {secondsUntilLock}s por inactividad — clic para extender
          </button>
        )}

        {/* Toolbar — drag region para arrastrar la ventana */}
        <header className="drag-region flex items-center justify-between border-b border-white/5 px-6 py-3">
          <div className="no-drag">
            <h1 className="text-base font-semibold text-white">Cuentas guardadas</h1>
            <p className="text-xs text-slate-500">{accounts.length} resultados</p>
          </div>
          <button
            onClick={openCreate}
            className="no-drag flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Nueva cuenta
          </button>
        </header>

        {/* Filters */}
        <div className="border-b border-white/5">
          <SearchFilters />
        </div>

        {/* Table */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <AccountTable onEdit={openEdit} />
        </div>

        {/* Status bar */}
        <footer className="flex items-center gap-2 border-t border-white/5 px-4 py-2 text-xs text-slate-500">
          {statusMessage ? (
            <>
              {statusMessage.type === 'success' && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
              {statusMessage.type === 'error'   && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
              {statusMessage.type === 'info'    && <Info className="h-3.5 w-3.5 text-blue-400" />}
              <span className={
                statusMessage.type === 'success' ? 'text-green-400' :
                statusMessage.type === 'error'   ? 'text-red-400' :
                'text-blue-400'
              }>
                {statusMessage.text}
              </span>
            </>
          ) : (
            <span>Password Manager — 100% local</span>
          )}
        </footer>
      </div>

      </div>{/* fin flex contenido principal */}

      {/* Dialogs */}
      {showAccountDialog && (
        <AccountDialog account={editingAccount} onClose={closeDialog} />
      )}
      {showCategoryManager && (
        <CategoryManager onClose={() => setShowCategoryManager(false)} />
      )}
      {showSyncDialog && (
        <SyncDialog onClose={() => setShowSyncDialog(false)} />
      )}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
