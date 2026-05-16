import type { AccountRow } from '../db/accountRepo'
import type { CategoryRow } from '../db/categoryRepo'

/**
 * Representación "wire" de una cuenta que viaja por el sync.
 * Pasword y totp_secret van en CLARO (el transporte ya está cifrado con la
 * session key). Cada lado se encarga de cifrar/descifrar contra su propia
 * clave maestra antes/después del sync.
 */
export interface SyncAccount {
  uuid: string
  platform: string
  username: string
  password: string       // plaintext
  /** Solo informativo — los IDs locales no son comparables entre devices.
   *  El join se resuelve con `category_uuid`. */
  category_id: number
  /** UUID de la categoría — identidad universal usada por el sync. */
  category_uuid: string
  is_favorite: boolean | number
  notes: string
  url: string
  totp_secret: string    // plaintext (vacío si no tiene)
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SyncCategory {
  uuid: string
  name: string
  description: string
  color: string
  icon: string
  is_default: boolean | number
  updated_at: string
  deleted_at: string | null
}

export interface DirectionStats {
  /** Items que el lado adopta como nuevos (no los tenía y ahora sí, vivos) */
  added: number
  /** Items que el lado actualiza (los tenía y el otro lado tiene versión más nueva) */
  updated: number
  /** Items que el lado borra (tenía la versión viva, otro lado tiene tombstone más nuevo) */
  deleted: number
}

/**
 * Stats direccionales desde la perspectiva del que CORRE el merge (desktop).
 *
 *  - `pulled` = lo que el desktop adopta de mobile (lo que mobile aportó al merge)
 *  - `pushed` = lo que el desktop manda a mobile (lo que desktop aportó al merge)
 *
 * Mobile interpreta las stats con perspectiva invertida:
 *  - recibido = pushed (lo que desktop le envía)
 *  - enviado  = pulled (lo que el desktop tomó de mobile)
 */
export interface MergeStats {
  pulled: DirectionStats
  pushed: DirectionStats
}

export interface MergeResult<T> {
  /** Estado fusionado (incluye tombstones). Es lo que se persiste y devuelve a remoto. */
  merged: T[]
  /** Solo los registros que cambiaron localmente — usado para aplicar a la DB. */
  toApplyLocally: T[]
  stats: MergeStats
}

function emptyStats(): MergeStats {
  return {
    pulled: { added: 0, updated: 0, deleted: 0 },
    pushed: { added: 0, updated: 0, deleted: 0 },
  }
}

function combineStats(a: MergeStats, b: MergeStats): MergeStats {
  return {
    pulled: {
      added:   a.pulled.added   + b.pulled.added,
      updated: a.pulled.updated + b.pulled.updated,
      deleted: a.pulled.deleted + b.pulled.deleted,
    },
    pushed: {
      added:   a.pushed.added   + b.pushed.added,
      updated: a.pushed.updated + b.pushed.updated,
      deleted: a.pushed.deleted + b.pushed.deleted,
    },
  }
}

export { combineStats, emptyStats }

/**
 * LWW merge por UUID. Para cada UUID presente en local o remoto:
 *  - Si solo está en uno → ese es el ganador.
 *  - Si está en ambos → gana el de `updated_at` más reciente.
 *  - Ties (mismo timestamp): gana local (decisión arbitraria pero estable).
 *
 * Devuelve el estado fusionado completo + lista de registros que cambiaron
 * en local + estadísticas humanas.
 */
export function mergeByUuid<T extends { uuid: string; updated_at: string; deleted_at: string | null }>(
  local: T[],
  remote: T[]
): MergeResult<T> {
  const localByUuid = new Map(local.map(x => [x.uuid, x]))
  const remoteByUuid = new Map(remote.map(x => [x.uuid, x]))
  const allUuids = new Set<string>([...localByUuid.keys(), ...remoteByUuid.keys()])

  const merged: T[] = []
  const toApplyLocally: T[] = []
  const stats = emptyStats()

  for (const uuid of allUuids) {
    const l = localByUuid.get(uuid)
    const r = remoteByUuid.get(uuid)

    if (l && !r) {
      // Solo local → se envía al remoto. Si está viva, cuenta como push.added;
      // si es tombstone, remoto nunca tuvo nada que borrar → no cuenta.
      merged.push(l)
      if (!l.deleted_at) stats.pushed.added++
    } else if (!l && r) {
      // Solo remoto → se aplica localmente. Si está viva, pull.added; si es
      // tombstone, local no tenía nada que borrar → no cuenta (igual se guarda
      // para propagar el tombstone en futuros syncs).
      merged.push(r)
      toApplyLocally.push(r)
      if (!r.deleted_at) stats.pulled.added++
    } else if (l && r) {
      const lTime = Date.parse(l.updated_at) || 0
      const rTime = Date.parse(r.updated_at) || 0
      const lDead = !!l.deleted_at
      const rDead = !!r.deleted_at

      if (rTime > lTime) {
        // Remoto más nuevo → adoptar
        merged.push(r)
        toApplyLocally.push(r)
        if (rDead && !lDead) stats.pulled.deleted++
        else if (!rDead && !lDead) stats.pulled.updated++
        else if (!rDead && lDead) stats.pulled.added++  // "undelete" (raro pero válido)
        // (rDead && lDead: ambos ya muertos, no cuenta)
      } else {
        // Local más nuevo o empate (gana local en empate)
        merged.push(l)
        if (lTime > rTime) {
          if (lDead && !rDead) stats.pushed.deleted++
          else if (!lDead && !rDead) stats.pushed.updated++
          else if (!lDead && rDead) stats.pushed.added++
        }
      }
    }
  }

  return { merged, toApplyLocally, stats }
}

// --- Conversores entre AccountRow/CategoryRow del desktop y el formato wire ---

export function accountRowToSync(
  row: AccountRow,
  decryptPassword: (cipher: string) => string,
  categoryUuidById: Map<number, string>
): SyncAccount {
  // Recovery graceful: si un campo no descifra (típicamente por restos de un
  // cambio de contraseña viejo donde no se re-cifró todo), no rompemos el sync
  // completo. La cuenta se envía con el campo vacío y se pierde solo ese dato.
  const safeDecrypt = (cipher: string, fieldName: string): string => {
    if (!cipher) return ''
    try {
      return decryptPassword(cipher)
    } catch {
      console.warn(`[sync] No se pudo descifrar ${fieldName} de uuid=${row.uuid} — se envía vacío`)
      return ''
    }
  }

  return {
    uuid: row.uuid,
    platform: row.platform,
    username: row.username,
    password: safeDecrypt(row.password, 'password'),
    category_id: row.category_id,
    category_uuid: categoryUuidById.get(row.category_id) ?? '',
    is_favorite: row.is_favorite === 1,
    notes: row.notes,
    url: row.url,
    totp_secret: safeDecrypt(row.totp_secret, 'totp_secret'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at
  }
}

export function syncToAccountRow(
  a: SyncAccount,
  encryptPassword: (plain: string) => string,
  categoryIdByUuid: Map<string, number>,
  defaultCategoryId: number
): Omit<AccountRow, 'id'> {
  // Resolver category_uuid → category_id local. Si el uuid no existe en local
  // (categoría nunca sincronizada o eliminada), cae a la categoría por defecto
  // para no romper la FK constraint.
  const resolvedCategoryId = a.category_uuid
    ? (categoryIdByUuid.get(a.category_uuid) ?? defaultCategoryId)
    : defaultCategoryId

  return {
    uuid: a.uuid,
    platform: a.platform,
    username: a.username,
    password: a.password ? encryptPassword(a.password) : '',
    category_id: resolvedCategoryId,
    is_favorite: a.is_favorite ? 1 : 0,
    notes: a.notes,
    url: a.url,
    totp_secret: a.totp_secret ? encryptPassword(a.totp_secret) : '',
    created_at: a.created_at,
    updated_at: a.updated_at,
    deleted_at: a.deleted_at
  }
}

export function categoryRowToSync(row: CategoryRow): SyncCategory {
  return {
    uuid: row.uuid,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    is_default: row.is_default === 1,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at
  }
}

export function syncToCategoryRow(c: SyncCategory): Omit<CategoryRow, 'id'> {
  return {
    uuid: c.uuid,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    is_default: c.is_default ? 1 : 0,
    updated_at: c.updated_at,
    deleted_at: c.deleted_at
  }
}
