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
import SecurityDashboard from '../components/SecurityDashboard'
import TrashView from '../components/TrashView'
import ImportDialog from '../components/ImportDialog'
import PortableBackupDialog from '../components/PortableBackupDialog'
import { useIdleLock } from '../hooks/useIdleLock'
import type { Account } from '../types/electron'

const isWin = window.electronAPI.platform === 'win32'

export type MainView = 'accounts' | 'security' | 'trash'

const VIEW_TITLE: Record<MainView, string> = {
  accounts: 'Cuentas guardadas',
  security: 'Seguridad',
  trash: 'Papelera',
}

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
  const [view, setView]                               = useState<MainView>('accounts')
  const [showImport, setShowImport]                   = useState(false)
  const [portableMode, setPortableMode]               = useState<'export' | 'import' | null>(null)

  const openCreate = () => { setEditingAccount(undefined); setShowAccountDialog(true) }
  const openEdit   = (a: Account) => { setEditingAccount(a); setShowAccountDialog(true) }
  const closeDialog = () => { setShowAccountDialog(false); setEditingAccount(undefined) }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary">
      {/* Barra de título personalizada — solo Windows */}
      {isWin && <WinTitleBar />}

      {/* Contenido principal */}
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        onManageCategories={() => setShowCategoryManager(true)}
        onSync={() => setShowSyncDialog(true)}
        onOpenSettings={() => setShowSettings(true)}
        onImport={() => setShowImport(true)}
        onPortableBackup={setPortableMode}
        view={view}
        onChangeView={setView}
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
        <header className="drag-region flex items-center justify-between border-b border-border px-6 py-3">
          <div className="no-drag">
            <h1 className="text-base font-semibold text-primary">{VIEW_TITLE[view]}</h1>
            {view === 'accounts' && <p className="text-xs text-muted">{accounts.length} resultados</p>}
          </div>
          <button
            onClick={openCreate}
            className="no-drag flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-primary transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Nueva cuenta
          </button>
        </header>

        {view === 'accounts' && (
          <>
            {/* Filters */}
            <div className="border-b border-border">
              <SearchFilters />
            </div>

            {/* Table */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <AccountTable onEdit={openEdit} />
            </div>
          </>
        )}
        {view === 'security' && <SecurityDashboard onEdit={openEdit} />}
        {view === 'trash' && <TrashView />}

        {/* Status bar */}
        <footer className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted">
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
            <span>Nubeless — 100% local</span>
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
      {portableMode && (
        <PortableBackupDialog mode={portableMode} onClose={() => setPortableMode(null)} />
      )}
      {showImport && (
        <ImportDialog onClose={() => setShowImport(false)} />
      )}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
