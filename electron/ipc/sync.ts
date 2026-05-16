import { ipcMain, BrowserWindow } from 'electron'
import { SyncServer, type SyncStatePayload } from '../sync/syncServer'
import {
  mergeByUuid, combineStats,
  accountRowToSync, syncToAccountRow,
  categoryRowToSync, syncToCategoryRow,
  type SyncAccount, type SyncCategory
} from '../sync/mergeService'
import { getAllAccountsForSync, upsertAccountByUuid } from '../db/accountRepo'
import { getAllCategoriesForSync, upsertCategoryByUuid } from '../db/categoryRepo'
import { getDb } from '../db/database'
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
    const mergeHandler = (incoming: SyncStatePayload): SyncStatePayload => {
      // 1. Snapshot del estado local. Necesitamos el mapping id→uuid de
      //    categorías ANTES de convertir las cuentas a wire (para llenar category_uuid).
      const localCategoryRows = getAllCategoriesForSync()
      const localCategoryUuidById = new Map<number, string>(
        localCategoryRows.map(c => [c.id, c.uuid])
      )

      const localCategories = localCategoryRows.map(categoryRowToSync)
      const localAccounts = getAllAccountsForSync().map(r =>
        accountRowToSync(r, c => crypto.decryptPassword(c), localCategoryUuidById)
      )

      // 2. Merge LWW
      const accountMerge  = mergeByUuid<SyncAccount>(localAccounts, incoming.accounts)
      const categoryMerge = mergeByUuid<SyncCategory>(localCategories, incoming.categories)

      // 3. Aplicar cambios LOCALES dentro de una transacción.
      //    ORDEN IMPORTA: categorías PRIMERO, luego cuentas (la FK constraint
      //    `accounts.category_id REFERENCES categories(id)` requiere que la
      //    categoría exista antes de insertar la cuenta).
      const db = getDb()
      const apply = db.transaction(() => {
        for (const c of categoryMerge.toApplyLocally) {
          upsertCategoryByUuid(syncToCategoryRow(c))
        }

        // Después de aplicar categorías, releer para tener el mapping uuid→id
        // ACTUALIZADO (incluye categorías recién creadas por el merge).
        const afterCategories = getAllCategoriesForSync()
        const categoryIdByUuid = new Map<string, number>(
          afterCategories.map(c => [c.uuid, c.id])
        )
        const defaultCat = afterCategories.find(
          c => c.name === 'Sin categoría' && !c.deleted_at
        )
        const defaultCategoryId = defaultCat?.id ?? 1

        for (const a of accountMerge.toApplyLocally) {
          // Re-cifrar con la clave maestra del DESKTOP antes de guardar
          upsertAccountByUuid(syncToAccountRow(
            a,
            p => crypto.encryptPassword(p),
            categoryIdByUuid,
            defaultCategoryId
          ))
        }
      })
      apply()

      // 4. Combinar stats y devolver el estado fusionado COMPLETO al móvil
      const stats = combineStats(accountMerge.stats, categoryMerge.stats)

      return {
        accounts:   accountMerge.merged,
        categories: categoryMerge.merged,
        exportedAt: new Date().toISOString(),
        stats,
        v: 1
      }
    }

    const session = await syncServer.start(mergeHandler)
    return { qrData: session.qrData, expiresAt: session.expiresAt }
  })

  ipcMain.handle('sync:stop', async () => {
    await syncServer?.stop()
  })
}
