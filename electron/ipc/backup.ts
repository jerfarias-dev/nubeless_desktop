import { ipcMain, shell } from 'electron'
import type { BackupService, BackupMeta } from '../backup/backupService'

export function registerBackupHandlers(backup: BackupService): void {
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
}
