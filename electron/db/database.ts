import Database from 'better-sqlite3'
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
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL DEFAULT '',
      color       TEXT    NOT NULL DEFAULT '#607D8B',
      icon        TEXT    NOT NULL DEFAULT 'folder',
      is_default  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      platform    TEXT    NOT NULL,
      username    TEXT    NOT NULL,
      password    TEXT    NOT NULL,
      category_id INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      notes       TEXT    NOT NULL DEFAULT '',
      url         TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET DEFAULT
    );
  `)

  if (isNew) {
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categories (name, description, color, icon, is_default)
      VALUES (@name, @description, @color, @icon, @is_default)
    `)
    const insertMany = db.transaction((cats: typeof DEFAULT_CATEGORIES) => {
      for (const cat of cats) insertCat.run(cat)
    })
    insertMany(DEFAULT_CATEGORIES)

    db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')").run()
  }

  return db
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
