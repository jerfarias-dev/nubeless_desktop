import { ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAllAccountsRaw, insertAccountRaw, type AccountRow } from '../db/accountRepo'
import { getAllCategories, createCategory } from '../db/categoryRepo'
import { parseImportFile, duplicateKey, FORMAT_LABEL, type ImportedEntry } from '../import/importers'
import { getDb } from '../db/database'
import type { CryptoService } from '../crypto/cryptoService'

interface VaultExport {
  version: number
  exportedAt: string
  accounts: AccountRow[]
}

export function registerVaultHandlers(crypto: CryptoService, userDataPath: string): void {

  // --- Export encrypted vault ---
  ipcMain.handle('vault:exportEncrypted', (_event, targetPath: string) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const accounts = getAllAccountsRaw()
    const payload: VaultExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts
    }
    const json = JSON.stringify(payload)
    const encrypted = crypto.encryptVaultData(json)
    writeFileSync(targetPath, encrypted)
  })

  // --- Import encrypted vault ---
  ipcMain.handle('vault:importEncrypted', (_event, sourcePath: string) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')

    const dbPath = join(userDataPath, 'passwords.db')
    const bakPath = join(userDataPath, `passwords_${Date.now()}.bak`)
    if (existsSync(dbPath)) copyFileSync(dbPath, bakPath)

    const raw = readFileSync(sourcePath)
    const json = crypto.decryptVaultData(raw)
    const payload = JSON.parse(json) as VaultExport

    const db = getDb()
    db.prepare('DELETE FROM accounts').run()

    const insert = db.transaction((rows: AccountRow[]) => {
      for (const row of rows) {
        insertAccountRaw({
          // Si el export no tenía uuid (versión vieja), insertAccountRaw genera uno.
          uuid:        row.uuid ?? '',
          platform:    row.platform,
          username:    row.username,
          password:    row.password,
          category_id: row.category_id,
          is_favorite: row.is_favorite,
          notes:       row.notes,
          url:         row.url,
          totp_secret: row.totp_secret ?? '',
          created_at:  row.created_at,
          updated_at:  row.updated_at,
          deleted_at:  row.deleted_at ?? null
        })
      }
    })
    insert(payload.accounts)
    return payload.accounts.length
  })

  // --- Export CSV (safe: passwords hidden) ---
  ipcMain.handle('vault:exportCSV', (_event, filePath: string, safe: boolean) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const accounts = getAllAccountsRaw()
    const categories = getAllCategories()
    const catMap = new Map(categories.map(c => [c.id, c.name]))

    const header = 'Platform,Username,Password,Category,URL,Favorite,Notes'
    const rows = accounts.map(a => {
      const pwd = safe ? '***' : crypto.decryptPassword(a.password)
      const cat = catMap.get(a.category_id) ?? ''
      return [
        csvEscape(a.platform),
        csvEscape(a.username),
        csvEscape(pwd),
        csvEscape(cat),
        csvEscape(a.url),
        a.is_favorite ? 'yes' : 'no',
        csvEscape(a.notes)
      ].join(',')
    })

    writeFileSync(filePath, [header, ...rows].join('\n'), 'utf8')
    return accounts.length
  })

  // --- Import CSV ---
  ipcMain.handle('vault:importCSV', (_event, filePath: string) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) return 0

    const categories = getAllCategories()
    const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const defaultCat = categories.find(c => c.name === 'Sin categoría')?.id ?? 1

    let imported = 0
    const db = getDb()
    const now = new Date().toISOString()

    const insert = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.length < 3) continue
        const [platform, username, password, category, url, favorite, notes] = cols
        if (!platform || !username || !password || password === '***') continue
        const catId = catMap.get((category ?? '').toLowerCase()) ?? defaultCat
        const encPwd = crypto.encryptPassword(password)
        insertAccountRaw({
          uuid: '',  // auto-generado por insertAccountRaw
          platform, username, password: encPwd,
          category_id: catId,
          is_favorite: favorite?.toLowerCase() === 'yes' ? 1 : 0,
          notes: notes ?? '',
          url: url ?? '',
          totp_secret: '',
          created_at: now,
          updated_at: now,
          deleted_at: null
        })
        imported++
      }
    })
    insert()
    return imported
  })
}

// ─── Importar de otros gestores ─────────────────────────────────────────────

export interface ImportPreview {
  format: string
  formatLabel: string
  /** Entradas importables (con contraseña). */
  total: number
  /** De esas, cuántas ya existen en la bóveda (misma plataforma + usuario). */
  duplicates: number
  /** Registros que no se pueden importar (sin contraseña, notas, tarjetas…). */
  skipped: number
  withTotp: number
  /** Carpetas / grupos de origen distintos. */
  sourceCategories: string[]
}

export interface ImportOptions {
  /** 'source' = usar la carpeta de origen (se crea la categoría si no existe);
   *  'fixed' = todo a `categoryId`. */
  categoryMode: 'source' | 'fixed'
  categoryId: number
  skipDuplicates: boolean
}

function existingKeys(): Set<string> {
  return new Set(getAllAccountsRaw().map(a => duplicateKey(a.platform, a.username)))
}

/** Último segmento de "Root/Banco/MX" → "MX"; vacío si no hay. */
function cleanCategoryName(raw: string): string {
  const last = raw.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return last.trim().slice(0, 40)
}

export function registerImportHandlers(crypto: CryptoService): void {
  ipcMain.handle('vault:importPreview', (_event, filePath: string): ImportPreview => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const parsed = parseImportFile(readFileSync(filePath, 'utf8'))
    const keys = existingKeys()
    return {
      format: parsed.format,
      formatLabel: FORMAT_LABEL[parsed.format],
      total: parsed.entries.length,
      duplicates: parsed.entries.filter(e => keys.has(duplicateKey(e.platform, e.username))).length,
      skipped: parsed.skipped,
      withTotp: parsed.entries.filter(e => e.totp).length,
      sourceCategories: [...new Set(parsed.entries.map(e => cleanCategoryName(e.category)).filter(Boolean))],
    }
  })

  ipcMain.handle('vault:importRun', (_event, filePath: string, opts: ImportOptions) => {
    if (!crypto.isUnlocked()) throw new Error('Vault locked')
    const parsed = parseImportFile(readFileSync(filePath, 'utf8'))
    const keys = existingKeys()
    const categories = getAllCategories()
    const byName = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const fallback = categories.find(c => c.name === 'Sin categoría')?.id ?? categories[0]?.id ?? 1

    const categoryFor = (e: ImportedEntry): number => {
      if (opts.categoryMode === 'fixed') return opts.categoryId
      const name = cleanCategoryName(e.category)
      if (!name) return fallback
      const found = byName.get(name.toLowerCase())
      if (found) return found
      const created = createCategory({ name, color: '#607D8B', icon: 'folder' })
      byName.set(name.toLowerCase(), created.id)
      return created.id
    }

    let imported = 0
    let skippedDuplicates = 0
    const now = new Date().toISOString()
    getDb().transaction(() => {
      for (const e of parsed.entries) {
        const key = duplicateKey(e.platform, e.username)
        if (opts.skipDuplicates && keys.has(key)) { skippedDuplicates++; continue }
        insertAccountRaw({
          uuid: '',
          platform: e.platform || 'Sin nombre',
          username: e.username,
          password: crypto.encryptPassword(e.password),
          category_id: categoryFor(e),
          is_favorite: e.favorite ? 1 : 0,
          notes: e.notes,
          url: e.url,
          totp_secret: e.totp ? crypto.encryptPassword(e.totp) : '',
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })
        keys.add(key)
        imported++
      }
    })()
    return { imported, skippedDuplicates, skipped: parsed.skipped }
  })
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
