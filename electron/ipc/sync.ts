import { ipcMain, BrowserWindow } from 'electron'
import { SyncServer, type SyncStatePayload } from '../sync/syncServer'
import { mergeIncomingState } from '../sync/applyMerge'
import type { CryptoService } from '../crypto/cryptoService'

let syncServer: SyncServer | null = null

export function registerSyncHandlers(crypto: CryptoService): void {

  ipcMain.handle('sync:start', async () => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')

    if (!syncServer) syncServer = new SyncServer(crypto)

    // Reenviar eventos del servidor al renderer
    syncServer.setEventListener(event => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('sync:event', event)
    })

    // mergeHandler — se llama cuando el móvil POST /sync con su estado.
    // Hace LWW por UUID, aplica los cambios localmente en una transacción
    // SQLite, y devuelve el estado fusionado completo (incluyendo tombstones).
    const mergeHandler = (incoming: SyncStatePayload): SyncStatePayload =>
      mergeIncomingState(crypto, incoming)

    const session = await syncServer.start(mergeHandler)
    return {
      qrData: session.qrData,
      expiresAt: session.expiresAt,
      ips: session.ips,    // útil para mostrar diagnóstico en la UI
    }
  })

  ipcMain.handle('sync:stop', async () => {
    await syncServer?.stop()
  })
}
