import { ipcMain } from 'electron'
import {
  getAllAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  type AccountRow,
  type AccountInput
} from '../db/accountRepo'
import type { CryptoService } from '../crypto/cryptoService'

function rowToAccount(row: AccountRow, crypto: CryptoService) {
  // Recovery: si el totp_secret está cifrado con una clave distinta a la actual
  // (típicamente porque una versión vieja del cambio de contraseña no lo
  // re-cifró), no rompemos el acceso a la cuenta — solo perdemos el TOTP.
  let totpDecrypted = ''
  if (row.totp_secret) {
    try {
      totpDecrypted = crypto.decryptPassword(row.totp_secret)
    } catch {
      console.warn(`[accounts] totp_secret de cuenta id=${row.id} no descifrable — se ignora`)
      totpDecrypted = ''
    }
  }

  return {
    id: row.id,
    uuid: row.uuid,
    platform: row.platform,
    username: row.username,
    password: crypto.decryptPassword(row.password),
    category_id: row.category_id,
    is_favorite: row.is_favorite === 1,
    notes: row.notes,
    url: row.url,
    totp_secret: totpDecrypted,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

interface AccountFromRenderer {
  id?: number
  uuid?: string
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite?: boolean | number
  notes?: string
  url?: string
  totp_secret?: string
  created_at?: string
  updated_at?: string
}

export function registerAccountHandlers(crypto: CryptoService): void {
  ipcMain.handle('accounts:getAll', () => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const rows = getAllAccounts()
    return rows.map(r => rowToAccount(r, crypto))
  })

  ipcMain.handle('accounts:create', (_event, input: AccountFromRenderer) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const accountInput: AccountInput = {
      platform: input.platform,
      username: input.username,
      password: crypto.encryptPassword(input.password),
      category_id: input.category_id,
      is_favorite: input.is_favorite ? 1 : 0,
      notes: input.notes ?? '',
      url: input.url ?? '',
      totp_secret: input.totp_secret
        ? crypto.encryptPassword(input.totp_secret.trim())
        : ''
    }
    const row = createAccount(accountInput)
    return rowToAccount(row, crypto)
  })

  ipcMain.handle('accounts:update', (_event, account: AccountFromRenderer) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    if (account.id == null) throw new Error('Missing id')
    // Construimos AccountRow completo — uuid y deleted_at se preservan desde
    // el renderer (no son editables por el usuario, solo transitan).
    const updated: AccountRow = {
      id: account.id,
      uuid: account.uuid ?? '',
      platform: account.platform,
      username: account.username,
      password: crypto.encryptPassword(account.password),
      category_id: account.category_id,
      is_favorite: account.is_favorite ? 1 : 0,
      notes: account.notes ?? '',
      url: account.url ?? '',
      totp_secret: account.totp_secret
        ? crypto.encryptPassword(account.totp_secret.trim())
        : '',
      created_at: account.created_at ?? '',
      updated_at: account.updated_at ?? '',
      deleted_at: null
    }
    const row = updateAccount(updated)
    return rowToAccount(row, crypto)
  })

  ipcMain.handle('accounts:delete', (_event, id: number) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    deleteAccount(id)
  })
}
