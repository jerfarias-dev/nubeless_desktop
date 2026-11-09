import {
  mergeByUuid, combineStats,
  accountRowToSync, syncToAccountRow,
  categoryRowToSync, syncToCategoryRow,
  type SyncAccount, type SyncCategory
} from './mergeService'
import type { SyncStatePayload } from './syncServer'
import { getAllAccountsForSync, upsertAccountByUuid } from '../db/accountRepo'
import { getAllCategoriesForSync, upsertCategoryByUuid } from '../db/categoryRepo'
import { getDb } from '../db/database'
import type { CryptoService } from '../crypto/cryptoService'

/**
 * Estado local completo en formato wire (cuentas descifradas + categorías,
 * incluidas lápidas). Es lo que se manda por el sync y lo que guarda el
 * respaldo portátil `.nubeless`.
 */
export function exportLocalState(crypto: CryptoService): { accounts: SyncAccount[]; categories: SyncCategory[] } {
  const categoryRows = getAllCategoriesForSync()
  const uuidById = new Map<number, string>(categoryRows.map(c => [c.id, c.uuid]))
  return {
    accounts: getAllAccountsForSync().map(r => accountRowToSync(r, c => crypto.decryptPassword(c), uuidById)),
    categories: categoryRows.map(categoryRowToSync),
  }
}

/**
 * Fusiona un estado entrante (del móvil por QR, o de un respaldo `.nubeless`)
 * con la DB local: LWW por UUID, aplica los cambios en una transacción y
 * devuelve el estado fusionado completo + stats (perspectiva del desktop).
 */
export function mergeIncomingState(crypto: CryptoService, incoming: SyncStatePayload): SyncStatePayload {
  // 1. Snapshot del estado local. Necesitamos el mapping id→uuid de
  //    categorías ANTES de convertir las cuentas a wire (para llenar category_uuid).
  const localCategoryRows = getAllCategoriesForSync()
  const localCategoryUuidById = new Map<number, string>(
    localCategoryRows.map(c => [c.id, c.uuid])
  )

  const localCategories = localCategoryRows.map(categoryRowToSync)

  // 1b. Normalizar UUIDs de categorías entrantes: si el móvil trae una
  //     categoría con el mismo nombre que una local, adoptamos el UUID local.
  //     Esto evita UNIQUE constraint en `categories.name` cuando el móvil
  //     creó categorías standalone con UUIDs distintos a los del desktop.
  const localCatByName = new Map(localCategories.map(c => [c.name, c]))
  const uuidRemap = new Map<string, string>()  // oldUuid → newUuid
  const incomingCatsNormalized = incoming.categories.map(c => {
    const local = localCatByName.get(c.name)
    if (local && local.uuid !== c.uuid) {
      uuidRemap.set(c.uuid, local.uuid)
      return { ...c, uuid: local.uuid }
    }
    return c
  })

  // 1c. Reemplazar category_uuid en las cuentas entrantes si la categoría
  //     fue renombrada al UUID local.
  const incomingAccountsNormalized = incoming.accounts.map(a => {
    const newUuid = uuidRemap.get(a.category_uuid)
    return newUuid ? { ...a, category_uuid: newUuid } : a
  })

  const localAccounts = getAllAccountsForSync().map(r =>
    accountRowToSync(r, c => crypto.decryptPassword(c), localCategoryUuidById)
  )

  // 2. Merge LWW (con UUIDs normalizados)
  const accountMerge  = mergeByUuid<SyncAccount>(localAccounts, incomingAccountsNormalized)
  const categoryMerge = mergeByUuid<SyncCategory>(localCategories, incomingCatsNormalized)

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
