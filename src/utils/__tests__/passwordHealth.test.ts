import { describe, test, expect } from 'vitest'
import {
  evalStrength,
  findDuplicateAccountIds,
  computeAccountHealth,
  summarizeHealth,
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
