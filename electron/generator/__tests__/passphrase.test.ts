import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { WORDLIST_ES } from '../wordlist_es'
import { generatePassphrase, passphraseEntropyBits, DEFAULT_PASSPHRASE } from '../passphrase'

// Mismo valor en test/core/utils/passphrase_test.dart (móvil).
const WORDLIST_SHA256 = 'bac3adcf02b3d09995007d3fe94e2d0eb442d4a1a04ae40c38c445a7e3f38e7e'

describe('wordlist_es', () => {
  test('2048 palabras únicas, solo a-z', () => {
    expect(WORDLIST_ES.length).toBe(2048)
    expect(new Set(WORDLIST_ES).size).toBe(2048)
    expect(WORDLIST_ES.every(w => /^[a-z]{3,8}$/.test(w))).toBe(true)
  })

  test('idéntica a la del móvil (SHA-256)', () => {
    const h = createHash('sha256').update(WORDLIST_ES.join('\n')).digest('hex')
    expect(h).toBe(WORDLIST_SHA256)
  })
})

describe('generatePassphrase', () => {
  test('con pick determinista produce la frase esperada', () => {
    // pick siempre devuelve 0 → primera palabra, número 10 en la palabra 0
    const p = generatePassphrase(DEFAULT_PASSPHRASE, () => 0)
    expect(p).toBe('Abeja10-Abeja-Abeja-Abeja-Abeja')
  })

  test('respeta número de palabras, separador y minúsculas', () => {
    const p = generatePassphrase({ words: 6, separator: '.', capitalize: false, addNumber: false })
    const parts = p.split('.')
    expect(parts).toHaveLength(6)
    expect(parts.every(w => WORDLIST_ES.includes(w))).toBe(true)
  })

  test('limita el número de palabras a 4–8', () => {
    expect(generatePassphrase({ words: 2, addNumber: false }).split('-')).toHaveLength(4)
    expect(generatePassphrase({ words: 20, addNumber: false }).split('-')).toHaveLength(8)
  })

  test('entropía por defecto ≥ 60 bits', () => {
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE)).toBeGreaterThanOrEqual(60)
  })
})
