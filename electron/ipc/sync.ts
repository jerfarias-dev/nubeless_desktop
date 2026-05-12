import { ipcMain, BrowserWindow } from 'electron'
import { SyncServer } from '../sync/syncServer'
import { getAllAccounts } from '../db/accountRepo'
import { getAllCategories } from '../db/categoryRepo'
import type { CryptoService } from '../crypto/cryptoService'

let syncServer: SyncServer | null = null

export function registerSyncHandlers(crypto: CryptoService): void {

  ipcMain.handle('sync:start', async () => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')

    // Descifrar todas las cuentas para enviarlas al móvil
    const rows       = getAllAccounts()
    const categories = getAllCategories()
    const accounts   = rows.map(r => ({
      id:          r.id,
      platform:    r.platform,
      username:    r.username,
      password:    crypto.decryptPassword(r.password),
      category_id: r.category_id,
      is_favorite: r.is_favorite === 1,
      notes:       r.notes,
      url:         r.url,
      created_at:  r.created_at,
      updated_at:  r.updated_at
    }))

    const payload = JSON.stringify({ accounts, categories, exportedAt: new Date().toISOString(), v: 1 })

    if (!syncServer) syncServer = new SyncServer(crypto)

    // Reenviar eventos del servidor al renderer via webContents
    syncServer.setEventListener(event => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('sync:event', event)
    })

    const session = await syncServer.start(payload)
    return { qrData: session.qrData, expiresAt: session.expiresAt }
  })

  ipcMain.handle('sync:stop', async () => {
    await syncServer?.stop()
  })
}
