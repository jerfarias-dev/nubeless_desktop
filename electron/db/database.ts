import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

let db: Database.Database | null = null

const DEFAULT_CATEGORIES = [
  { name: 'Sin categoría',    description: 'Sin categoría asignada', color: '#757575', icon: 'folder',       is_default: 1 },
  { name: 'Redes Sociales',   description: 'Redes sociales',         color: '#E91E63', icon: 'share-2',      is_default: 1 },
  { name: 'Correo',           description: 'Cuentas de correo',      color: '#2196F3', icon: 'mail',         is_default: 1 },
  { name: 'Trabajo',          description: 'Cuentas de trabajo',     color: '#4CAF50', icon: 'briefcase',    is_default: 1 },
  { name: 'Finanzas',         description: 'Cuentas financieras',    color: '#FFC107', icon: 'credit-card',  is_default: 1 },
  { name: 'Entretenimiento',  description: 'Entretenimiento',        color: '#9C27B0', icon: 'play-circle',  is_default: 1 },
  { name: 'Compras',          description: 'Tiendas y compras',      color: '#FF5722', icon: 'shopping-cart', is_default: 1 },
  { name: 'Otros',            description: 'Otras cuentas',          color: '#607D8B', icon: 'more-horizontal', is_default: 1 }
]

export function initDatabase(userDataPath: string): Database.Database {
  const dbPath = join(userDataPath, 'passwords.db')
  const isNew = !existsSync(dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid        TEXT    NOT NULL DEFAULT '',
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#607D8B',
      icon        TEXT    NOT NULL DEFAULT 'folder',
      is_default  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid        TEXT    NOT NULL DEFAULT '',
      platform    TEXT    NOT NULL,
      username    TEXT    NOT NULL,
      password    TEXT    NOT NULL,
      category_id INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      notes       TEXT    NOT NULL DEFAULT '',
      url         TEXT    NOT NULL DEFAULT '',
      totp_secret TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      deleted_at  TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET DEFAULT
    );
  `)

  if (isNew) {
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categories (uuid, name, description, color, icon, is_default)
      VALUES (@uuid, @name, @description, @color, @icon, @is_default)
    `)
    const insertMany = db.transaction((cats: typeof DEFAULT_CATEGORIES) => {
      for (const cat of cats) insertCat.run({ ...cat, uuid: randomUUID() })
    })
    insertMany(DEFAULT_CATEGORIES)

    db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '4')").run()
  } else {
    runMigrations(db)
  }

  // Índices únicos sobre uuid — se crean DESPUÉS de poblar/migrar para que
  // no existan filas con uuid vacío al momento de crearlos.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_uuid   ON accounts(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_uuid ON categories(uuid);
  `)

  return db
}

/**
 * Migraciones para DBs existentes. El número de versión se guarda en `meta`.
 * Cada migración debe ser idempotente y manejar el caso "ya aplicada".
 */
function runMigrations(db: Database.Database): void {
  const current = getSchemaVersion(db)

  // v1 → v2: agregar columna totp_secret a accounts
  if (current < 2) {
    const cols = db.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>
    if (!cols.some(c => c.name === 'totp_secret')) {
      db.exec("ALTER TABLE accounts ADD COLUMN totp_secret TEXT NOT NULL DEFAULT ''")
    }
    setSchemaVersion(db, 2)
  }

  // v2 → v3: agregar uuid + deleted_at a accounts y categories (preparación sync bidireccional)
  if (current < 3) {
    const accCols = db.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>
    if (!accCols.some(c => c.name === 'uuid')) {
      db.exec("ALTER TABLE accounts ADD COLUMN uuid TEXT NOT NULL DEFAULT ''")
    }
    if (!accCols.some(c => c.name === 'deleted_at')) {
      db.exec("ALTER TABLE accounts ADD COLUMN deleted_at TEXT")
    }

    const catCols = db.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>
    if (!catCols.some(c => c.name === 'uuid')) {
      db.exec("ALTER TABLE categories ADD COLUMN uuid TEXT NOT NULL DEFAULT ''")
    }
    if (!catCols.some(c => c.name === 'deleted_at')) {
      db.exec("ALTER TABLE categories ADD COLUMN deleted_at TEXT")
    }

    // Backfill: generar UUIDs únicos para filas existentes
    const accountsNoUuid = db.prepare(
      "SELECT id FROM accounts WHERE uuid = '' OR uuid IS NULL"
    ).all() as Array<{ id: number }>
    const updAcc = db.prepare("UPDATE accounts SET uuid = ? WHERE id = ?")
    const backfillAcc = db.transaction((rows: typeof accountsNoUuid) => {
      for (const r of rows) updAcc.run(randomUUID(), r.id)
    })
    backfillAcc(accountsNoUuid)

    const catsNoUuid = db.prepare(
      "SELECT id FROM categories WHERE uuid = '' OR uuid IS NULL"
    ).all() as Array<{ id: number }>
    const updCat = db.prepare("UPDATE categories SET uuid = ? WHERE id = ?")
    const backfillCat = db.transaction((rows: typeof catsNoUuid) => {
      for (const r of rows) updCat.run(randomUUID(), r.id)
    })
    backfillCat(catsNoUuid)

    setSchemaVersion(db, 3)
  }

  // v3 → v4: agregar updated_at a categories (necesario para LWW merge)
  if (current < 4) {
    const catCols = db.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>
    if (!catCols.some(c => c.name === 'updated_at')) {
      // SQLite no permite DEFAULT con función no constante en ALTER, así que
      // agregamos sin default y backfilleamos con un timestamp uniforme.
      db.exec("ALTER TABLE categories ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
      const now = new Date().toISOString()
      db.prepare("UPDATE categories SET updated_at = ? WHERE updated_at = ''").run(now)
    }
    setSchemaVersion(db, 4)
  }
}

function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string } | undefined
  return row ? parseInt(row.value, 10) : 1
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES ('schema_version', @v)
    ON CONFLICT(key) DO UPDATE SET value = @v
  `).run({ v: String(version) })
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
