import { getDb } from './database'

export interface AccountRow {
  id: number
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite: number
  notes: string
  url: string
  created_at: string
  updated_at: string
}

export interface AccountInput {
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite?: number
  notes?: string
  url?: string
}

export function getAllAccounts(): AccountRow[] {
  return getDb()
    .prepare(`
      SELECT * FROM accounts
      ORDER BY is_favorite DESC, platform ASC
    `)
    .all() as AccountRow[]
}

export function createAccount(input: AccountInput): AccountRow {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO accounts (platform, username, password, category_id, is_favorite, notes, url)
    VALUES (@platform, @username, @password, @category_id, @is_favorite, @notes, @url)
  `)
  const info = stmt.run({
    platform: input.platform,
    username: input.username,
    password: input.password,
    category_id: input.category_id,
    is_favorite: input.is_favorite ?? 0,
    notes: input.notes ?? '',
    url: input.url ?? ''
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
        updated_at  = datetime('now')
    WHERE id = @id
  `).run(account)
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as AccountRow
}

export function deleteAccount(id: number): void {
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

export function getAllAccountsRaw(): AccountRow[] {
  return getDb().prepare('SELECT * FROM accounts').all() as AccountRow[]
}

export function insertAccountRaw(account: Omit<AccountRow, 'id'>): void {
  getDb().prepare(`
    INSERT INTO accounts (platform, username, password, category_id, is_favorite, notes, url, created_at, updated_at)
    VALUES (@platform, @username, @password, @category_id, @is_favorite, @notes, @url, @created_at, @updated_at)
  `).run(account)
}
