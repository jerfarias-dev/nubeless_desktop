/**
 * Importadores de otros gestores de contraseñas. Funciones puras: reciben el
 * texto del archivo y devuelven entradas normalizadas en claro. El IPC
 * (electron/ipc/vault.ts) se encarga de cifrar e insertar.
 *
 * Formatos soportados (detección por estructura / cabeceras):
 *  - Bitwarden: JSON sin cifrar y CSV
 *  - 1Password: CSV (1Password 7 y 8)
 *  - Chrome / Edge / Brave: CSV
 *  - Firefox: CSV
 *  - KeePass / KeePassXC: CSV
 *  - Nubeless: CSV propio (exportado desde esta app)
 */

export type ImportFormat =
  | 'bitwarden-json'
  | 'bitwarden-csv'
  | '1password-csv'
  | 'chrome-csv'
  | 'firefox-csv'
  | 'keepass-csv'
  | 'nubeless-csv'
  | 'generic-csv'

export const FORMAT_LABEL: Record<ImportFormat, string> = {
  'bitwarden-json': 'Bitwarden (JSON)',
  'bitwarden-csv': 'Bitwarden (CSV)',
  '1password-csv': '1Password (CSV)',
  'chrome-csv': 'Chrome / Edge / Brave (CSV)',
  'firefox-csv': 'Firefox (CSV)',
  'keepass-csv': 'KeePass / KeePassXC (CSV)',
  'nubeless-csv': 'Nubeless (CSV)',
  'generic-csv': 'CSV genérico',
}

export interface ImportedEntry {
  platform: string
  username: string
  password: string
  url: string
  notes: string
  /** Secreto TOTP en base32 (ya extraído si venía como otpauth://). */
  totp: string
  /** Carpeta / grupo / categoría de origen, si el formato la trae. */
  category: string
  favorite: boolean
}

export interface ParseResult {
  format: ImportFormat
  entries: ImportedEntry[]
  /** Registros que no se pudieron importar (sin contraseña, tarjetas, notas…). */
  skipped: number
}

// ─── CSV (RFC 4180: comillas, comillas escapadas, saltos de línea dentro) ────

export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(c => c !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Extrae el secreto de un `otpauth://totp/...?secret=XXX`; si ya es base32, lo limpia. */
export function extractTotpSecret(value: string): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (/^otpauth:\/\//i.test(v)) {
    try {
      return (new URL(v).searchParams.get('secret') ?? '').replace(/\s+/g, '').toUpperCase()
    } catch {
      return ''
    }
  }
  if (/^steam:\/\//i.test(v)) return '' // Steam Guard no es TOTP estándar
  return v.replace(/[\s-]+/g, '').toUpperCase()
}

/** "https://www.github.com/login" → "github.com" */
export function platformFromUrl(url: string): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`).hostname
    return host.replace(/^www\./, '')
  } catch {
    return u
  }
}

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes|si|sí|y)$/i.test((v ?? '').trim())
}

function entry(partial: Partial<ImportedEntry>): ImportedEntry {
  const url = (partial.url ?? '').trim()
  const platform = (partial.platform ?? '').trim() || platformFromUrl(url)
  return {
    platform,
    username: (partial.username ?? '').trim(),
    password: partial.password ?? '',
    url,
    notes: (partial.notes ?? '').trim(),
    totp: extractTotpSecret(partial.totp ?? ''),
    category: (partial.category ?? '').trim(),
    favorite: partial.favorite ?? false,
  }
}

// ─── Bitwarden JSON ──────────────────────────────────────────────────────────

interface BwItem {
  type: number
  name?: string
  notes?: string | null
  favorite?: boolean
  folderId?: string | null
  login?: {
    username?: string | null
    password?: string | null
    totp?: string | null
    uris?: Array<{ uri?: string | null }> | null
  } | null
}

function parseBitwardenJson(json: { encrypted?: boolean; folders?: Array<{ id: string; name: string }>; items?: BwItem[] }): ParseResult {
  if (json.encrypted) {
    throw new Error('El archivo de Bitwarden está cifrado. Exporta en formato "JSON" (sin cifrar).')
  }
  const folders = new Map((json.folders ?? []).map(f => [f.id, f.name]))
  const entries: ImportedEntry[] = []
  let skipped = 0
  for (const it of json.items ?? []) {
    // type 1 = login; 2 = nota, 3 = tarjeta, 4 = identidad (llegan en la 1.3)
    if (it.type !== 1 || !it.login?.password) { skipped++; continue }
    entries.push(entry({
      platform: it.name ?? '',
      username: it.login.username ?? '',
      password: it.login.password,
      url: it.login.uris?.[0]?.uri ?? '',
      notes: it.notes ?? '',
      totp: it.login.totp ?? '',
      category: it.folderId ? folders.get(it.folderId) ?? '' : '',
      favorite: !!it.favorite,
    }))
  }
  return { format: 'bitwarden-json', entries, skipped }
}

// ─── CSV por cabeceras ───────────────────────────────────────────────────────

/** Alias de columnas por campo. Se comparan en minúsculas y sin espacios extra. */
const ALIASES: Record<keyof ImportedEntry, string[]> = {
  platform: ['name', 'title', 'platform', 'account', 'nombre', 'titulo'],
  username: ['login_username', 'username', 'user name', 'user', 'login', 'email', 'usuario'],
  password: ['login_password', 'password', 'contraseña', 'contrasena'],
  url: ['login_uri', 'url', 'website', 'uri', 'web site', 'urls', 'sitio'],
  notes: ['notes', 'note', 'notas', 'comments', 'extra'],
  totp: ['login_totp', 'totp', 'otpauth', 'one-time password', 'otp'],
  category: ['folder', 'group', 'category', 'categoria', 'tags', 'grupo'],
  favorite: ['favorite', 'favourite', 'favorite status', 'favorito', 'is_favorite'],
}

function detectCsvFormat(header: string[]): ImportFormat {
  const h = new Set(header)
  if (h.has('login_password') && h.has('login_uri')) return 'bitwarden-csv'
  if (h.has('httprealm') || h.has('formactionorigin')) return 'firefox-csv'
  if (h.has('group') && h.has('title') && h.has('password')) return 'keepass-csv'
  if (h.has('title') && (h.has('otpauth') || h.has('one-time password') || h.has('archived') || h.has('archived status'))) return '1password-csv'
  if (h.has('platform') && h.has('password')) return 'nubeless-csv'
  if (h.has('name') && h.has('url') && h.has('username') && h.has('password')) return 'chrome-csv'
  return 'generic-csv'
}

function parseCsvFile(text: string): ParseResult {
  const rows = parseCSV(text)
  if (rows.length === 0) return { format: 'generic-csv', entries: [], skipped: 0 }

  const header = rows[0].map(c => c.trim().toLowerCase())
  const format = detectCsvFormat(header)
  const col = (field: keyof ImportedEntry): number => {
    for (const alias of ALIASES[field]) {
      const i = header.indexOf(alias)
      if (i >= 0) return i
    }
    return -1
  }
  const idx = Object.fromEntries(
    (Object.keys(ALIASES) as Array<keyof ImportedEntry>).map(f => [f, col(f)])
  ) as Record<keyof ImportedEntry, number>

  if (idx.password < 0) {
    throw new Error('No se encontró una columna de contraseña en el archivo.')
  }

  const get = (row: string[], f: keyof ImportedEntry) => (idx[f] >= 0 ? row[idx[f]] ?? '' : '')
  const entries: ImportedEntry[] = []
  let skipped = 0

  for (const row of rows.slice(1)) {
    // Bitwarden CSV: type distinto de "login" (nota, tarjeta…) → se omite
    const typeIdx = header.indexOf('type')
    if (format === 'bitwarden-csv' && typeIdx >= 0 && row[typeIdx] && row[typeIdx] !== 'login') {
      skipped++; continue
    }
    const password = get(row, 'password')
    if (!password || password === '***') { skipped++; continue }
    entries.push(entry({
      platform: get(row, 'platform'),
      username: get(row, 'username'),
      password,
      url: get(row, 'url'),
      notes: get(row, 'notes'),
      totp: get(row, 'totp'),
      category: get(row, 'category'),
      favorite: truthy(get(row, 'favorite')),
    }))
  }
  return { format, entries, skipped }
}

// ─── Entrada principal ───────────────────────────────────────────────────────

export function parseImportFile(text: string): ParseResult {
  const trimmed = text.replace(/^﻿/, '').trimStart()
  if (trimmed.startsWith('{')) {
    let json: unknown
    try {
      json = JSON.parse(trimmed)
    } catch {
      throw new Error('El archivo parece JSON pero no se pudo leer.')
    }
    if (json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)) {
      return parseBitwardenJson(json as Parameters<typeof parseBitwardenJson>[0])
    }
    throw new Error('Formato JSON no reconocido. Solo se admite el JSON sin cifrar de Bitwarden.')
  }
  return parseCsvFile(text)
}

/** Clave para detectar duplicados contra la bóveda: plataforma + usuario. */
export function duplicateKey(platform: string, username: string): string {
  return `${platform.trim().toLowerCase()}\u0000${username.trim().toLowerCase()}`
}
