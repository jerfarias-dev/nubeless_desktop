import { getDb } from './database'

export interface CategoryRow {
  id: number
  name: string
  description: string
  color: string
  icon: string
  is_default: number
}

export interface CategoryInput {
  name: string
  description?: string
  color: string
  icon?: string
}

export function getAllCategories(): CategoryRow[] {
  return getDb()
    .prepare('SELECT * FROM categories ORDER BY is_default DESC, name ASC')
    .all() as CategoryRow[]
}

export function createCategory(input: CategoryInput): CategoryRow {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO categories (name, description, color, icon)
    VALUES (@name, @description, @color, @icon)
  `)
  const info = stmt.run({
    name: input.name,
    description: input.description ?? '',
    color: input.color,
    icon: input.icon ?? 'folder'
  })
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) as CategoryRow
}

export function updateCategory(cat: CategoryRow): CategoryRow {
  const db = getDb()
  db.prepare(`
    UPDATE categories
    SET name = @name, description = @description, color = @color, icon = @icon
    WHERE id = @id
  `).run(cat)
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id) as CategoryRow
}

export function deleteCategory(id: number): void {
  const db = getDb()
  const cat = db.prepare('SELECT is_default FROM categories WHERE id = ?').get(id) as CategoryRow | undefined
  if (!cat) throw new Error('Categoría no encontrada')
  if (cat.is_default) throw new Error('No se puede eliminar una categoría por defecto')
  const uncategorized = db.prepare("SELECT id FROM categories WHERE name = 'Sin categoría'").get() as { id: number }
  db.prepare('UPDATE accounts SET category_id = ? WHERE category_id = ?').run(uncategorized.id, id)
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
}
