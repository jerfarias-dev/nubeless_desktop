import { ipcMain } from 'electron'
import type { CryptoService } from '../crypto/cryptoService'
import type { BackupService } from '../backup/backupService'
import { getAllAccountsRaw } from '../db/accountRepo'
import { getDb } from '../db/database'

export function registerAuthHandlers(
  crypto: CryptoService,
  backup: BackupService
): void {
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

  /**
   * Cambiar contraseña maestra. Antes de iniciar toma un backup defensivo
   * (cifrado con la clave VIEJA) — si algo se corrompe en el camino el usuario
   * podría recuperar usando ese .enc con su contraseña vieja.
   *
   * El orchestrator inyecta:
   *  - getEncryptedAccounts: lee los password ya cifrados del DB
   *  - applyAccountUpdates: aplica los nuevos password en UNA transacción SQLite
   *
   * Retorna { ok: true } si todo salió bien o { ok: false, reason } si falló
   * la verificación de la contraseña vieja.
   */
  ipcMain.handle('auth:changeMasterPassword', async (_event, oldPwd: string, newPwd: string) => {
    if (!newPwd || newPwd.length < 8) {
      throw new Error('La contraseña nueva debe tener al menos 8 caracteres')
    }
    if (oldPwd === newPwd) {
      throw new Error('La contraseña nueva debe ser distinta de la actual')
    }

    // Backup defensivo — cifrado con la clave VIEJA. Si algo sale mal y
    // queda el vault inconsistente, el usuario podría recuperar manualmente
    // restaurando ANTES de cambiar la contraseña.
    backup.create()

    const ok = crypto.changeMasterPassword(oldPwd, newPwd, (oldKey, newKey) => {
      // Re-cifra TODOS los campos cifrados del vault: password Y totp_secret.
      // Si olvidáramos totp_secret, las cuentas con 2FA quedarían rotas porque
      // su secreto seguiría cifrado con la clave vieja.
      const accounts = getAllAccountsRaw()

      const updates = accounts.map(a => ({
        id: a.id,
        password: crypto.encrypt(crypto.decrypt(a.password, oldKey), newKey),
        totp_secret: a.totp_secret
          ? crypto.encrypt(crypto.decrypt(a.totp_secret, oldKey), newKey)
          : ''
      }))

      // Una sola transacción para que sea atómico — si una falla, todas se revierten
      const db = getDb()
      const stmt = db.prepare(
        'UPDATE accounts SET password = ?, totp_secret = ? WHERE id = ?'
      )
      const txn = db.transaction((rows: typeof updates) => {
        for (const r of rows) stmt.run(r.password, r.totp_secret, r.id)
      })
      txn(updates)
    })

    if (!ok) return { ok: false, reason: 'wrong-old-password' as const }
    return { ok: true as const }
  })
}
