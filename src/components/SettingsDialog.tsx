import { useEffect, useState } from 'react'
import {
  X, Shield, Archive, Info, Lock, KeyRound, Clock, Smartphone,
  Plus, FolderOpen, RotateCcw, Trash2, FileLock2, Loader2
} from 'lucide-react'
import { useSettings, AUTO_LOCK_OPTIONS } from '../store/useSettings'
import { useStore } from '../store/useStore'
import ChangeMasterPasswordDialog from './ChangeMasterPasswordDialog'
import type { BackupMeta } from '../types/electron'

interface Props {
  onClose(): void
}

type Section = 'security' | 'backups' | 'about'

// Versión de la app — TODO: exponer desde package.json vía preload
const APP_VERSION = '1.0.0'

const SECTIONS: { id: Section; label: string; icon: typeof Shield }[] = [
  { id: 'security', label: 'Seguridad', icon: Shield },
  { id: 'backups',  label: 'Backups',   icon: Archive },
  { id: 'about',    label: 'Acerca de', icon: Info },
]

export default function SettingsDialog({ onClose }: Props) {
  const [section, setSection] = useState<Section>('security')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[520px] w-full max-w-3xl overflow-hidden rounded-2xl bg-surface-card ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Nav lateral de secciones */}
        <nav className="flex w-48 flex-col border-r border-white/5 bg-black/20 p-3">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Configuración
          </p>
          {SECTIONS.map(s => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-accent/20 text-white'
                    : 'text-slate-400 hover:bg-surface-hover hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            )
          })}
        </nav>

        {/* Panel de contenido */}
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <h2 className="text-base font-semibold text-white">
              {SECTIONS.find(s => s.id === section)?.label}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {section === 'security' && <SecuritySection />}
            {section === 'backups'  && <BackupsSection />}
            {section === 'about'    && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Seguridad
// ─────────────────────────────────────────────────────────────────────────────
function SecuritySection() {
  const autoLockMinutes = useSettings(s => s.autoLockMinutes)
  const setAutoLockMinutes = useSettings(s => s.setAutoLockMinutes)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const setStatus = useStore(s => s.setStatus)

  const labelFor = (m: number) => (m === 0 ? 'Desactivado' : `${m} min`)

  return (
    <div className="space-y-6">
      {/* Auto-bloqueo — FUNCIONAL */}
      <SettingCard
        icon={Clock}
        title="Auto-bloqueo por inactividad"
        description="Bloquea la bóveda automáticamente tras un periodo sin actividad. Aparece un aviso en el último minuto."
      >
        <div className="flex flex-wrap gap-2">
          {AUTO_LOCK_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => setAutoLockMinutes(m)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                autoLockMinutes === m
                  ? 'bg-accent text-white'
                  : 'bg-surface-input text-slate-400 hover:text-white'
              }`}
            >
              {labelFor(m)}
            </button>
          ))}
        </div>
      </SettingCard>

      {/* Cambiar contraseña maestra — FUNCIONAL */}
      <SettingCard
        icon={KeyRound}
        title="Cambiar contraseña maestra"
        description="Re-deriva la clave del vault y re-cifra todas las cuentas con una contraseña nueva. Se crea un backup automático antes del cambio."
      >
        <button
          onClick={() => setShowChangePwd(true)}
          className="rounded-lg bg-surface-input px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Cambiar contraseña…
        </button>
      </SettingCard>

      {showChangePwd && (
        <ChangeMasterPasswordDialog
          onClose={() => setShowChangePwd(false)}
          onSuccess={() => {
            setShowChangePwd(false)
            setStatus({ text: 'Contraseña maestra actualizada', type: 'success' })
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Backups (manual + rotación de los últimos 10)
// ─────────────────────────────────────────────────────────────────────────────
function BackupsSection() {
  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // 'create' | fileName de un restore/delete
  const [error, setError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<BackupMeta | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<BackupMeta | null>(null)

  // Acciones que necesitan refrescar la UI principal tras restore
  const setStatus    = useStore(s => s.setStatus)
  const loadAccounts = useStore(s => s.loadAccounts)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.backup.list()
      setBackups(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al listar backups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleCreate = async () => {
    setBusy('create')
    setError(null)
    try {
      await window.electronAPI.backup.create()
      await refresh()
      setStatus({ text: 'Backup creado correctamente', type: 'success' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear backup')
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async (b: BackupMeta) => {
    setBusy(b.fileName)
    setError(null)
    try {
      const count = await window.electronAPI.backup.restore(b.fileName)
      await loadAccounts()  // refresca la tabla principal
      setStatus({ text: `${count} cuentas restauradas desde backup`, type: 'success' })
      setConfirmRestore(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al restaurar')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (b: BackupMeta) => {
    setBusy(b.fileName)
    try {
      await window.electronAPI.backup.delete(b.fileName)
      await refresh()
      setConfirmDelete(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <SettingCard
        icon={Archive}
        title="Backups manuales"
        description="Crea copias cifradas locales de tu bóveda. Se guardan en la carpeta de datos del sistema y rotan automáticamente — se conservan los 10 más recientes."
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreate}
            disabled={busy === 'create'}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy === 'create'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Plus className="h-4 w-4" />}
            Hacer backup ahora
          </button>
          <button
            onClick={() => window.electronAPI.backup.openFolder()}
            className="flex items-center gap-2 rounded-lg bg-surface-input px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            <FolderOpen className="h-4 w-4" />
            Abrir carpeta
          </button>
        </div>
      </SettingCard>

      {/* Lista de backups existentes */}
      <div className="rounded-xl border border-white/5 bg-surface-input/30">
        <div className="border-b border-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Backups guardados {backups.length > 0 && `(${backups.length}/10)`}
        </div>

        {error && (
          <p className="px-4 py-3 text-xs text-red-400">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : backups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <FileLock2 className="mx-auto mb-2 h-6 w-6 text-slate-600" />
            Aún no hay backups. Crea uno con el botón de arriba.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {backups.map(b => {
              const date = new Date(b.createdAt)
              const isBusy = busy === b.fileName
              return (
                <li key={b.fileName} className="flex items-center gap-3 px-4 py-3">
                  <FileLock2 className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(b.size)} · {b.fileName}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmRestore(b)}
                    disabled={isBusy}
                    title="Restaurar"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    {isBusy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RotateCcw className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(b)}
                    disabled={isBusy}
                    title="Eliminar"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Confirmación de restore */}
      {confirmRestore && (
        <ConfirmDialog
          icon={RotateCcw}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/15"
          title="¿Restaurar este backup?"
          message="Esto reemplazará todas las cuentas actuales con las del backup. La operación no se puede deshacer (aunque se guarda una copia .bak automática)."
          confirmLabel="Sí, restaurar"
          confirmClass="bg-amber-500 hover:bg-amber-600"
          onCancel={() => setConfirmRestore(null)}
          onConfirm={() => handleRestore(confirmRestore)}
        />
      )}

      {/* Confirmación de delete */}
      {confirmDelete && (
        <ConfirmDialog
          icon={Trash2}
          iconColor="text-red-400"
          iconBg="bg-red-500/15"
          title="¿Eliminar este backup?"
          message={`Se eliminará permanentemente el archivo ${confirmDelete.fileName}.`}
          confirmLabel="Eliminar"
          confirmClass="bg-red-500 hover:bg-red-600"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Mini-modal de confirmación reutilizable para restore/delete
function ConfirmDialog({
  icon: Icon, iconColor, iconBg,
  title, message, confirmLabel, confirmClass,
  onConfirm, onCancel,
}: {
  icon: typeof Archive
  iconColor: string
  iconBg: string
  title: string
  message: string
  confirmLabel: string
  confirmClass: string
  onConfirm(): void
  onCancel(): void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-surface-card p-5 ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg bg-surface-input px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Acerca de
// ─────────────────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
          <Lock className="h-7 w-7 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Password Manager</h3>
          <p className="text-sm text-slate-500">Versión {APP_VERSION}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-surface-input/50 p-4 text-sm text-slate-400">
        <p className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-green-400" />
          Cifrado AES-256-GCM con PBKDF2-SHA512 (600 000 iteraciones)
        </p>
        <p className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-green-400" />
          100% local — ningún dato sale de tu equipo
        </p>
        <p className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-green-400" />
          Sincronización WiFi directa con la app móvil
        </p>
      </div>

      <p className="text-xs text-slate-600">
        Uso personal. Tus datos viven cifrados en el almacenamiento del sistema operativo.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: tarjeta de configuración
// ─────────────────────────────────────────────────────────────────────────────
function SettingCard({
  icon: Icon,
  title,
  description,
  comingSoon,
  children,
}: {
  icon: typeof Shield
  title: string
  description: string
  comingSoon?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-white/5 bg-surface-input/30 p-4 ${comingSoon ? 'opacity-70' : ''}`}>
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {comingSoon && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
            Próximamente
          </span>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">{description}</p>
      {children}
    </div>
  )
}
