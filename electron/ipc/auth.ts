import { ipcMain } from 'electron'
import type { CryptoService } from '../crypto/cryptoService'

export function registerAuthHandlers(crypto: CryptoService): void {
  ipcMain.handle('auth:isFirstTime', () => {
    return crypto.isFirstTime()
  })

  ipcMain.handle('auth:createMaster', (_event, password: string) => {
    if (!password || password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres')
    }
    crypto.createMasterPassword(password)
  })

  ipcMain.handle('auth:login', (_event, password: string) => {
    return crypto.login(password)
  })

  ipcMain.handle('auth:logout', () => {
    crypto.logout()
  })

  ipcMain.handle('auth:verifyPassword', (_event, password: string) => {
    return crypto.verifyPassword(password)
  })
}
