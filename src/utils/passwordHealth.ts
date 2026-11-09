import type { Account } from '../types/electron'

/** Heurística local de fortaleza — espejo de Flutter's evaluatePassword.
 *  Pura y rápida: sirve para evaluar muchas contraseñas en render sin IPC. */
export function evalStrength(pwd: string): { score: 0 | 1 | 2 | 3 | 4; isWeak: boolean } {
  if (!pwd) return { score: 0, isWeak: true }

  const hasLower  = /[a-z]/.test(pwd)
  const hasUpper  = /[A-Z]/.test(pwd)
  const hasDigit  = /[0-9]/.test(pwd)
  const hasSymbol = /[^a-zA-Z0-9]/.test(pwd)
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length
  const len = pwd.length

  let score: 0 | 1 | 2 | 3 | 4
  if (len < 6)          score = 0
  else if (len < 8)     score = 1
  else if (len < 12)    score = variety >= 3 ? 2 : 1
  else if (len < 16)    score = variety >= 3 ? 3 : 2
  else                  score = variety >= 3 ? 4 : 3

  // Consideramos "débil" todo lo que sea score < 2
  return { score, isWeak: score < 2 }
}

/** Devuelve los IDs de cuentas que comparten password con al menos otra. */
export function findDuplicateAccountIds(accounts: Account[]): Set<number> {
  const byPassword = new Map<string, number[]>()
  for (const a of accounts) {
    if (!a.password) continue
    const list = byPassword.get(a.password) ?? []
    list.push(a.id)
    byPassword.set(a.password, list)
  }
  const dupes = new Set<number>()
  for (const ids of byPassword.values()) {
    if (ids.length > 1) ids.forEach(id => dupes.add(id))
  }
  return dupes
}

export interface AccountHealth {
  isWeak: boolean
  isDuplicate: boolean
  /** Cuántas cuentas (incluyendo esta) comparten esa contraseña — solo si isDuplicate */
  duplicateCount?: number
}

/** Computa health de cada cuenta — una sola pasada, eficiente. */
export function computeAccountHealth(accounts: Account[]): Map<number, AccountHealth> {
  const dupCount = new Map<string, number>()
  for (const a of accounts) {
    if (!a.password) continue
    dupCount.set(a.password, (dupCount.get(a.password) ?? 0) + 1)
  }

  const out = new Map<number, AccountHealth>()
  for (const a of accounts) {
    const dupes = dupCount.get(a.password) ?? 0
    const { isWeak } = evalStrength(a.password)
    out.set(a.id, {
      isWeak,
      isDuplicate: dupes > 1,
      duplicateCount: dupes > 1 ? dupes : undefined,
    })
  }
  return out
}

/** Resumen agregado para mostrar en sidebar/stats. */
export function summarizeHealth(accounts: Account[]): { weak: number; duplicated: number; total: number } {
  const dupCount = new Map<string, number>()
  for (const a of accounts) {
    if (!a.password) continue
    dupCount.set(a.password, (dupCount.get(a.password) ?? 0) + 1)
  }
  let weak = 0
  let duplicated = 0
  for (const a of accounts) {
    if (evalStrength(a.password).isWeak) weak++
    if ((dupCount.get(a.password) ?? 0) > 1) duplicated++
  }
  return { weak, duplicated, total: accounts.length }
}

// ─── Panel de seguridad ──────────────────────────────────────────────────────
// Espejo de lib/core/utils/vault_report.dart (móvil). Si cambias una regla o
// un peso, cámbialo en los dos lados: los tests usan los mismos casos.

/** Días a partir de los cuales una contraseña se considera vieja. */
export const OLD_PASSWORD_DAYS = 365

export type IssueKind = 'weak' | 'reused' | 'old' | 'no2fa' | 'insecureUrl'

export interface VaultReport {
  /** 0–100. 100 = ninguna cuenta con problemas. */
  score: number
  total: number
  /** Cuentas afectadas por cada problema (una cuenta puede salir en varias). */
  issues: Record<IssueKind, Account[]>
}

/** Peso de cada problema al restar puntos a una cuenta (máximo 1 por cuenta). */
const ISSUE_WEIGHT: Record<IssueKind, number> = {
  weak: 0.5,
  reused: 0.4,
  old: 0.15,
  no2fa: 0.1,
  insecureUrl: 0.1,
}

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return (now.getTime() - t) / 86_400_000
}

/**
 * Reporte completo de la bóveda. `now` es inyectable para tests.
 *  - weak: evalStrength(...).isWeak
 *  - reused: la contraseña la comparte con al menos otra cuenta
 *  - old: más de OLD_PASSWORD_DAYS desde `updated_at`
 *  - no2fa: sin secreto TOTP
 *  - insecureUrl: la URL empieza con http:// (no https)
 */
export function computeVaultReport(accounts: Account[], now: Date = new Date()): VaultReport {
  const issues: Record<IssueKind, Account[]> = {
    weak: [], reused: [], old: [], no2fa: [], insecureUrl: [],
  }
  if (accounts.length === 0) return { score: 100, total: 0, issues }

  const health = computeAccountHealth(accounts)
  let penalty = 0

  for (const a of accounts) {
    const h = health.get(a.id)
    const found: IssueKind[] = []
    if (h?.isWeak) found.push('weak')
    if (h?.isDuplicate) found.push('reused')
    if (daysSince(a.updated_at, now) > OLD_PASSWORD_DAYS) found.push('old')
    if (!a.totp_secret?.trim()) found.push('no2fa')
    if (/^http:\/\//i.test(a.url?.trim() ?? '')) found.push('insecureUrl')

    for (const k of found) issues[k].push(a)
    penalty += Math.min(1, found.reduce((s, k) => s + ISSUE_WEIGHT[k], 0))
  }

  const score = Math.round(100 * (1 - penalty / accounts.length))
  return { score: Math.max(0, Math.min(100, score)), total: accounts.length, issues }
}
