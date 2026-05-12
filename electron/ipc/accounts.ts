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
  return {
    id: row.id,
    platform: row.platform,
    username: row.username,
    password: crypto.decryptPassword(row.password),
    category_id: row.category_id,
    is_favorite: row.is_favorite === 1,
    notes: row.notes,
    url: row.url,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

export function registerAccountHandlers(crypto: CryptoService): void {
  ipcMain.handle('accounts:getAll', () => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const rows = getAllAccounts()
    return rows.map(r => rowToAccount(r, crypto))
  })

  ipcMain.handle('accounts:create', (_event, input: AccountInput & { is_favorite?: boolean }) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const encryptedPwd = crypto.encryptPassword(input.password)
    const row = createAccount({
      ...input,
      password: encryptedPwd,
      is_favorite: input.is_favorite ? 1 : 0
    })
    return rowToAccount(row, crypto)
  })

  ipcMain.handle('accounts:update', (_event, account: AccountRow & { is_favorite: boolean }) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const encryptedPwd = crypto.encryptPassword(account.password)
    const row = updateAccount({
      ...account,
      password: encryptedPwd,
      is_favorite: account.is_favorite ? 1 : 0
    })
    return rowToAccount(row, crypto)
  })

  ipcMain.handle('accounts:delete', (_event, id: number) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    deleteAccount(id)
  })
}
