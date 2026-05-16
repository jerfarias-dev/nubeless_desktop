import { randomUUID } from 'node:crypto'
import { getDb } from './database'

export interface AccountRow {
  id: number
  uuid: string
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite: number
  notes: string
  url: string
  totp_secret: string  // base32 cifrado con la clave maestra
  created_at: string   // ISO 8601 (ms precision)
  updated_at: string   // ISO 8601 (ms precision)
  /** Si está presente la fila es una "lápida" — no se muestra en la UI pero sigue
   *  presente para que el sync propague el borrado al otro dispositivo. */
  deleted_at: string | null
}

export interface AccountInput {
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite?: number
  notes?: string
  url?: string
  totp_secret?: string
}

/** Solo cuentas vivas (sin tombstone) — lo que ve la UI. */
export function getAllAccounts(): AccountRow[] {
  return getDb()
    .prepare(`
      SELECT * FROM accounts
      WHERE deleted_at IS NULL
      ORDER BY is_favorite DESC, platform ASC
    `)
    .all() as AccountRow[]
}

/** TODAS las cuentas incluidas las borradas — usado por el sync para propagar tombstones. */
export function getAllAccountsForSync(): AccountRow[] {
  return getDb().prepare('SELECT * FROM accounts').all() as AccountRow[]
}

/** Sólo las activas, sin orden — usado por backup/export (no exporta tombstones). */
export function getAllAccountsRaw(): AccountRow[] {
  return getDb()
    .prepare('SELECT * FROM accounts WHERE deleted_at IS NULL')
    .all() as AccountRow[]
}

export function createAccount(input: AccountInput): AccountRow {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO accounts (uuid, platform, username, password, category_id, is_favorite, notes, url, totp_secret, created_at, updated_at)
    VALUES (@uuid, @platform, @username, @password, @category_id, @is_favorite, @notes, @url, @totp_secret, @created_at, @updated_at)
  `)
  const info = stmt.run({
    uuid: randomUUID(),
    platform: input.platform,
    username: input.username,
    password: input.password,
    category_id: input.category_id,
    is_favorite: input.is_favorite ?? 0,
    notes: input.notes ?? '',
    url: input.url ?? '',
    totp_secret: input.totp_secret ?? '',
    created_at: now,
    updated_at: now
  })
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid) as AccountRow
}

export function updateAccount(account: AccountRow): AccountRow {
  const db = getDb()
  db.prepare(`
    UPDATE accounts
    SET platform    = @platform,
        username    = @username,
        password    = @password,
        category_id = @category_id,
        is_favorite = @is_favorite,
        notes       = @notes,
        url         = @url,
        totp_secret = @totp_secret,
        updated_at  = @updated_at
    WHERE id = @id
  `).run({ ...account, updated_at: new Date().toISOString() })
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as AccountRow
}

/** Soft delete: marca la fila con deleted_at en lugar de eliminarla.
 *  Esto permite que el sync propague el borrado al otro dispositivo. */
export function deleteAccount(id: number): void {
  const now = new Date().toISOString()
  getDb().prepare(`
    UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?
  `).run(now, now, id)
}

/** Inserta una fila completa, generando UUID si no viene. Usado por imports y restore. */
export function insertAccountRaw(account: Omit<AccountRow, 'id'>): void {
  const finalUuid = account.uuid && account.uuid.length > 0 ? account.uuid : randomUUID()
  getDb().prepare(`
    INSERT INTO accounts (uuid, platform, username, password, category_id, is_favorite, notes, url, totp_secret, created_at, updated_at, deleted_at)
    VALUES (@uuid, @platform, @username, @password, @category_id, @is_favorite, @notes, @url, @totp_secret, @created_at, @updated_at, @deleted_at)
  `).run({ ...account, uuid: finalUuid, deleted_at: account.deleted_at ?? null })
}

/** Upsert por UUID — usado por el merge. Si existe la fila, actualiza todos los campos;
 *  si no, la crea. NO toca updated_at (lo respeta tal cual viene del merge). */
export function upsertAccountByUuid(account: Omit<AccountRow, 'id'>): void {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM accounts WHERE uuid = ?').get(account.uuid) as
    | { id: number } | undefined

  if (existing) {
    db.prepare(`
      UPDATE accounts
      SET platform    = @platform,
          username    = @username,
          password    = @password,
          category_id = @category_id,
          is_favorite = @is_favorite,
          notes       = @notes,
          url         = @url,
          totp_secret = @totp_secret,
          created_at  = @created_at,
          updated_at  = @updated_at,
          deleted_at  = @deleted_at
      WHERE id = @id
    `).run({ ...account, id: existing.id, deleted_at: account.deleted_at ?? null })
  } else {
    insertAccountRaw(account)
  }
}
