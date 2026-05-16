import { ipcMain } from 'electron'
import { generateTotp, looksLikeBase32, type TotpCode } from '../totp/totpService'

export function registerTotpHandlers(): void {
  /**
   * Genera el código TOTP actual para un secreto base32.
   * Devuelve también los segundos restantes para que el renderer pueda
   * pintar una barra de progreso sin necesidad de un timer en main.
   */
  ipcMain.handle('totp:generate', (_e, secretBase32: string): TotpCode => {
    return generateTotp(secretBase32)
  })

  ipcMain.handle('totp:validate', (_e, secretBase32: string): boolean => {
    return looksLikeBase32(secretBase32)
  })
}
