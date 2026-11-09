import { ipcMain, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import type { BackupService, BackupMeta } from '../backup/backupService'
import type { CryptoService } from '../crypto/cryptoService'
import { buildBackup, openBackup } from '../backup/portableBackup'
import { exportLocalState, mergeIncomingState } from '../sync/applyMerge'

export function registerBackupHandlers(backup: BackupService, crypto: CryptoService): void {
  ipcMain.handle('backup:create', (): BackupMeta => backup.create())
  ipcMain.handle('backup:list',   (): BackupMeta[] => backup.list())

  ipcMain.handle('backup:restore', (_e, fileName: string): number =>
    backup.restore(fileName)
  )

  ipcMain.handle('backup:delete', (_e, fileName: string): void => {
    backup.delete(fileName)
  })

  // Abre la carpeta de backups en Finder / Explorer
  ipcMain.handle('backup:openFolder', () => {
    shell.openPath(backup.folderPath)
  })

  // ─── Respaldo portátil .nubeless (se abre también en el móvil) ───────────
  ipcMain.handle('backup:exportPortable', (_e, filePath: string, password: string): number => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const state = exportLocalState(crypto)
    const file = buildBackup({ ...state, exportedAt: new Date().toISOString(), v: 1 }, password)
    writeFileSync(filePath, JSON.stringify(file), 'utf8')
    return state.accounts.filter(a => !a.deleted_at).length
  })

  ipcMain.handle('backup:importPortable', (_e, filePath: string, password: string) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const incoming = openBackup(readFileSync(filePath, 'utf8'), password)
    // Copia defensiva antes de fusionar (se puede restaurar desde Ajustes → Backups).
    backup.create()
    const merged = mergeIncomingState(crypto, { ...incoming, v: 1 })
    // pulled = lo que la bóveda local adoptó del respaldo
    return merged.stats?.pulled ?? { added: 0, updated: 0, deleted: 0 }
  })
}
