import { describe, test, expect } from 'vitest'
import { generateTotp, looksLikeBase32 } from '../totpService'

describe('TotpService — vectores RFC 6238', () => {
  // Mismo set de vectores oficiales que el móvil (Dart). Si ambos pasan
  // estos, garantizamos interoperabilidad cross-platform.
  // Secret = "12345678901234567890" en ASCII → base32 estándar:
  const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  const cases: Array<[number, string]> = [
    [59,         '287082'],   // RFC: 94287082 → últimos 6 dígitos
    [1111111109, '081804'],   // RFC: 07081804
    [1111111111, '050471'],   // RFC: 14050471
    [1234567890, '005924'],   // RFC: 89005924
    [2000000000, '279037'],   // RFC: 69279037
  ]

  for (const [t, expected] of cases) {
    test(`T=${t} → ${expected}`, () => {
      const code = generateTotp(SECRET, t * 1000)
      expect(code.code).toBe(expected)
    })
  }
})

describe('TotpService — secondsRemaining', () => {
  test('al inicio de una ventana, restan 30s', () => {
    expect(generateTotp('GEZDGNBVGY3TQOJQ', 60 * 1000).secondsRemaining).toBe(30)
  })

  test('a mitad de ventana, restan 15s', () => {
    expect(generateTotp('GEZDGNBVGY3TQOJQ', 75 * 1000).secondsRemaining).toBe(15)
  })

  test('1 segundo antes de rotar, resta 1s', () => {
    expect(generateTotp('GEZDGNBVGY3TQOJQ', 89 * 1000).secondsRemaining).toBe(1)
  })

  test('stepSeconds siempre es 30', () => {
    expect(generateTotp('GEZDGNBVGY3TQOJQ', Date.now()).stepSeconds).toBe(30)
  })
})

describe('TotpService — base32 tolerante', () => {
  const T = 1234567890 * 1000

  test('acepta minúsculas', () => {
    const upper = generateTotp('GEZDGNBVGY3TQOJQ', T)
    const lower = generateTotp('gezdgnbvgy3tqojq', T)
    expect(upper.code).toBe(lower.code)
  })

  test('acepta espacios y guiones intercalados', () => {
    const clean = generateTotp('GEZDGNBVGY3TQOJQ', T)
    const messy = generateTotp('GEZD-GNBV GY3T-QOJQ', T)
    expect(clean.code).toBe(messy.code)
  })

  test('secret vacío lanza error', () => {
    expect(() => generateTotp('', Date.now())).toThrow()
  })
})

describe('looksLikeBase32', () => {
  test('strings base32 válidos', () => {
    expect(looksLikeBase32('GEZDGNBVGY3TQOJQ')).toBe(true)
    expect(looksLikeBase32('JBSWY3DPEHPK3PXP')).toBe(true)
    expect(looksLikeBase32('AAAAAAAA====')).toBe(true)
  })

  test('strings inválidos', () => {
    expect(looksLikeBase32('')).toBe(false)
    expect(looksLikeBase32('SHORT')).toBe(false)          // < 8 chars
    expect(looksLikeBase32('AAAA0AAA')).toBe(false)        // 0 no es base32
    expect(looksLikeBase32('AAAA1AAA')).toBe(false)        // 1 no es base32
    expect(looksLikeBase32('lowercase!')).toBe(false)
  })
})
