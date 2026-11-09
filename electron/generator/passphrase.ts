import { randomInt } from 'node:crypto'
import { WORDLIST_ES } from './wordlist_es'

/** Opciones del generador de frases. Mismas opciones y defaults en el móvil
 *  (lib/core/utils/password_generator.dart → generatePassphrase). */
export interface PassphraseOptions {
  /** Número de palabras, 4–8. */
  words: number
  separator: string
  /** Primera letra de cada palabra en mayúscula. */
  capitalize: boolean
  /** Agrega un número de 2 dígitos (10–99) al final de una palabra al azar. */
  addNumber: boolean
}

export const DEFAULT_PASSPHRASE: PassphraseOptions = {
  words: 5,
  separator: '-',
  capitalize: true,
  addNumber: true,
}

export const MIN_WORDS = 4
export const MAX_WORDS = 8

/** Entropía aproximada en bits (11 bits por palabra con 2048 palabras). */
export function passphraseEntropyBits(opts: PassphraseOptions): number {
  const perWord = Math.log2(WORDLIST_ES.length)
  return Math.round(opts.words * perWord + (opts.addNumber ? Math.log2(90 * opts.words) : 0))
}

/** `pick` es inyectable para tests; por defecto usa crypto.randomInt (sin sesgo). */
export function generatePassphrase(
  input: Partial<PassphraseOptions> = {},
  pick: (max: number) => number = (max) => randomInt(max),
): string {
  const opts = { ...DEFAULT_PASSPHRASE, ...input }
  const n = Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.round(opts.words)))

  const words = Array.from({ length: n }, () => {
    const w = WORDLIST_ES[pick(WORDLIST_ES.length)]
    return opts.capitalize ? w[0].toUpperCase() + w.slice(1) : w
  })

  if (opts.addNumber) {
    const i = pick(n)
    words[i] = words[i] + String(10 + pick(90))
  }
  return words.join(opts.separator)
}
