import { describe, test, expect } from 'vitest'
import {
  evalStrength,
  findDuplicateAccountIds,
  computeAccountHealth,
  summarizeHealth,
  computeVaultReport,
} from '../passwordHealth'
import type { Account } from '../../types/electron'

// Factory mínimo — solo nos importan id y password para estos tests
const acc = (id: number, password: string): Account => ({
  id,
  uuid: `uuid-${id}`,
  platform: '', username: '', password,
  category_id: 1, is_favorite: false,
  notes: '', url: '', totp_secret: '',
  created_at: '', updated_at: '',
})

describe('evalStrength', () => {
  test('vacía → score 0, isWeak', () => {
    const s = evalStrength('')
    expect(s.score).toBe(0)
    expect(s.isWeak).toBe(true)
  })

  test('< 6 chars → score 0', () => {
    expect(evalStrength('abc').score).toBe(0)
    expect(evalStrength('12345').score).toBe(0)
  })

  test('6-7 chars → score 1 (débil)', () => {
    expect(evalStrength('abc123').score).toBe(1)
    expect(evalStrength('abc123!').score).toBe(1)
  })

  test('larga con variedad alta → score alto (no débil)', () => {
    const s = evalStrength('MyStr0ng!Pass1234')
    expect(s.score).toBe(4)
    expect(s.isWeak).toBe(false)
  })

  test('larga pero solo lowercase → score medio, no débil', () => {
    // 16 lowercase: largo lo salva
    const s = evalStrength('abcdefghijklmnop')
    expect(s.score).toBeGreaterThanOrEqual(2)
    expect(s.isWeak).toBe(false)
  })

  test('threshold de débil = score < 2', () => {
    expect(evalStrength('abcdefg').isWeak).toBe(true)        // score ≤ 1
    expect(evalStrength('abcdefghij1A').isWeak).toBe(false)  // score ≥ 2
  })
})

describe('findDuplicateAccountIds', () => {
  test('sin duplicados → set vacío', () => {
    const result = findDuplicateAccountIds([
      acc(1, 'pass-1'),
      acc(2, 'pass-2'),
      acc(3, 'pass-3'),
    ])
    expect(result.size).toBe(0)
  })

  test('dos comparten password → ambos en el set', () => {
    const result = findDuplicateAccountIds([
      acc(1, 'repetida'),
      acc(2, 'única'),
      acc(3, 'repetida'),
    ])
    expect(result.has(1)).toBe(true)
    expect(result.has(3)).toBe(true)
    expect(result.has(2)).toBe(false)
    expect(result.size).toBe(2)
  })

  test('tres comparten → los tres en el set', () => {
    const result = findDuplicateAccountIds([
      acc(1, 'x'), acc(2, 'x'), acc(3, 'x'),
    ])
    expect(result.size).toBe(3)
  })

  test('passwords vacías se ignoran (no cuentan como duplicadas)', () => {
    const result = findDuplicateAccountIds([
      acc(1, ''), acc(2, ''), acc(3, 'real'),
    ])
    expect(result.size).toBe(0)
  })

  test('case-sensitive: "abc" ≠ "ABC"', () => {
    const result = findDuplicateAccountIds([acc(1, 'abc'), acc(2, 'ABC')])
    expect(result.size).toBe(0)
  })
})

describe('computeAccountHealth', () => {
  test('cuenta con password débil y única', () => {
    const map = computeAccountHealth([acc(1, 'weak'), acc(2, 'strongLongOne1234')])
    expect(map.get(1)?.isWeak).toBe(true)
    expect(map.get(1)?.isDuplicate).toBe(false)
    expect(map.get(2)?.isWeak).toBe(false)
  })

  test('cuenta duplicada y fuerte', () => {
    const map = computeAccountHealth([
      acc(1, 'StrongPa$$word123!'),
      acc(2, 'StrongPa$$word123!'),
      acc(3, 'otra distinta y larga 12345!'),
    ])
    expect(map.get(1)?.isDuplicate).toBe(true)
    expect(map.get(1)?.duplicateCount).toBe(2)
    expect(map.get(1)?.isWeak).toBe(false)
    expect(map.get(3)?.isDuplicate).toBe(false)
  })

  test('cuenta débil Y duplicada → ambos flags true', () => {
    const map = computeAccountHealth([acc(1, 'abc'), acc(2, 'abc')])
    expect(map.get(1)?.isWeak).toBe(true)
    expect(map.get(1)?.isDuplicate).toBe(true)
  })
})

describe('summarizeHealth', () => {
  test('cuenta correctamente débiles y duplicadas', () => {
    const summary = summarizeHealth([
      acc(1, 'abc'),                       // débil, no duplicada
      acc(2, 'StrongPa$$word123!'),        // fuerte
      acc(3, 'StrongPa$$word123!'),        // fuerte pero duplicada con 2
      acc(4, 'xyz123'),                    // débil
    ])
    expect(summary.weak).toBe(2)         // ids 1 y 4
    expect(summary.duplicated).toBe(2)   // ids 2 y 3
    expect(summary.total).toBe(4)
  })

  test('sin cuentas → todo en 0', () => {
    const summary = summarizeHealth([])
    expect(summary.weak).toBe(0)
    expect(summary.duplicated).toBe(0)
    expect(summary.total).toBe(0)
  })
})

// Casos espejo de test/core/utils/vault_report_test.dart (móvil).
describe('computeVaultReport', () => {
  const NOW = new Date('2026-11-09T12:00:00.000Z')
  const mk = (id: number, over: Partial<Account> = {}): Account => ({
    id, uuid: `u${id}`, platform: `P${id}`, username: 'u', password: 'Fuerte#Clave2026xyz',
    category_id: 1, is_favorite: false, notes: '', url: 'https://ejemplo.com',
    totp_secret: 'JBSWY3DPEHPK3PXP', created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z', ...over,
  })

  test('bóveda vacía → 100', () => {
    const r = computeVaultReport([], NOW)
    expect(r.score).toBe(100)
    expect(r.total).toBe(0)
  })

  test('cuentas sin problemas → 100 y listas vacías', () => {
    const r = computeVaultReport([mk(1), mk(2, { password: 'Otra$Clave2026abc' })], NOW)
    expect(r.score).toBe(100)
    expect(Object.values(r.issues).every(l => l.length === 0)).toBe(true)
  })

  test('detecta cada problema', () => {
    const r = computeVaultReport([
      mk(1, { password: 'abc' }),                                    // weak
      mk(2, { password: 'Repetida#2026xyzw' }),                      // reused
      mk(3, { password: 'Repetida#2026xyzw' }),                      // reused
      mk(4, { password: 'Vieja#Clave2026xy', updated_at: '2025-01-01T00:00:00.000Z' }), // old
      mk(5, { password: 'Sin2FA#Clave2026x', totp_secret: '' }),     // no2fa
      mk(6, { password: 'Http#Clave2026xyz', url: 'http://inseguro.com' }), // insecureUrl
    ], NOW)
    expect(r.issues.weak.map(a => a.id)).toEqual([1])
    expect(r.issues.reused.map(a => a.id)).toEqual([2, 3])
    expect(r.issues.old.map(a => a.id)).toEqual([4])
    expect(r.issues.no2fa.map(a => a.id)).toEqual([5])
    expect(r.issues.insecureUrl.map(a => a.id)).toEqual([6])
    // penalización: 0.5 + 0.4 + 0.4 + 0.15 + 0.1 + 0.1 = 1.65 → 100*(1-1.65/6) = 72.5 → 73
    expect(r.score).toBe(73)
  })

  test('la penalización por cuenta tiene tope de 1', () => {
    const r = computeVaultReport([
      mk(1, { password: 'abc', totp_secret: '', url: 'http://x.com', updated_at: '2020-01-01T00:00:00.000Z' }),
      mk(2, { password: 'abc' }),
    ], NOW)
    // cuenta 1: weak+reused+old+no2fa+http = 1.25 → 1; cuenta 2: weak+reused = 0.9
    expect(r.score).toBe(5)
  })
})
