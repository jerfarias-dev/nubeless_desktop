import { randomUUID } from 'node:crypto'
import { getDb } from './database'

export interface CategoryRow {
  id: number
  uuid: string
  name: string
  description: string
  color: string
  icon: string
  is_default: number
  /** ISO 8601 con ms — usado por LWW merge. */
  updated_at: string
  /** ISO 8601. Si existe, la categoría está marcada como borrada (tombstone). */
  deleted_at: string | null
}

export interface CategoryInput {
  name: string
  description?: string
  color: string
  icon?: string
}

/** Solo categorías vivas — lo que ve la UI. */
export function getAllCategories(): CategoryRow[] {
  return getDb()
    .prepare(`
      SELECT * FROM categories
      WHERE deleted_at IS NULL
      ORDER BY is_default DESC, name ASC
    `)
    .all() as CategoryRow[]
}

/** TODAS las categorías incluidas las borradas — para el sync. */
export function getAllCategoriesForSync(): CategoryRow[] {
  return getDb().prepare('SELECT * FROM categories').all() as CategoryRow[]
}

export function createCategory(input: CategoryInput): CategoryRow {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO categories (uuid, name, description, color, icon, updated_at)
    VALUES (@uuid, @name, @description, @color, @icon, @updated_at)
  `)
  const info = stmt.run({
    uuid: randomUUID(),
    name: input.name,
    description: input.description ?? '',
    color: input.color,
    icon: input.icon ?? 'folder',
    updated_at: now
  })
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) as CategoryRow
}

export function updateCategory(cat: CategoryRow): CategoryRow {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE categories
    SET name = @name, description = @description, color = @color, icon = @icon,
        updated_at = @updated_at
    WHERE id = @id
  `).run({ ...cat, updated_at: now })
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id) as CategoryRow
}

/** Soft delete: marca con deleted_at. Las cuentas se reasignan a "Sin categoría". */
export function deleteCategory(id: number): void {
  const db = getDb()
  const cat = db.prepare('SELECT is_default FROM categories WHERE id = ?').get(id) as CategoryRow | undefined
  if (!cat) throw new Error('Categoría no encontrada')
  if (cat.is_default) throw new Error('No se puede eliminar una categoría por defecto')
  const uncategorized = db.prepare("SELECT id FROM categories WHERE name = 'Sin categoría'").get() as { id: number }
  const now = new Date().toISOString()
  // Reasignar cuentas y marcar la categoría como borrada
  db.prepare('UPDATE accounts SET category_id = ? WHERE category_id = ?').run(uncategorized.id, id)
  db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

/** Inserta una categoría completa preservando uuid/timestamps. Usado por el sync merge. */
export function insertCategoryRaw(cat: Omit<CategoryRow, 'id'>): void {
  const finalUuid = cat.uuid && cat.uuid.length > 0 ? cat.uuid : randomUUID()
  getDb().prepare(`
    INSERT INTO categories (uuid, name, description, color, icon, is_default, updated_at, deleted_at)
    VALUES (@uuid, @name, @description, @color, @icon, @is_default, @updated_at, @deleted_at)
  `).run({ ...cat, uuid: finalUuid, deleted_at: cat.deleted_at ?? null })
}

/** Upsert por UUID — usado por el merge. Si existe la fila, actualiza; si no, crea. */
export function upsertCategoryByUuid(cat: Omit<CategoryRow, 'id'>): void {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM categories WHERE uuid = ?').get(cat.uuid) as
    | { id: number } | undefined

  if (existing) {
    db.prepare(`
      UPDATE categories
      SET name = @name, description = @description, color = @color, icon = @icon,
          is_default = @is_default, updated_at = @updated_at, deleted_at = @deleted_at
      WHERE id = @id
    `).run({ ...cat, id: existing.id, deleted_at: cat.deleted_at ?? null })
  } else {
    insertCategoryRaw(cat)
  }
}
