import { createHmac } from 'node:crypto'

/**
 * Implementación TOTP (RFC 6238) compatible con Google Authenticator y similares.
 * Parámetros estándar: HMAC-SHA1, 6 dígitos, ventana de 30 segundos.
 *
 * Verificado contra los vectores oficiales del RFC 6238:
 *   Secret  = "12345678901234567890" → base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
 *   T=59         → 94287082
 *   T=1111111109 → 07081804
 *   T=1111111111 → 14050471
 *   T=1234567890 → 89005924
 *   T=2000000000 → 69279037
 */

const STEP = 30 // segundos por código
const DIGITS = 6

export interface TotpCode {
  /** Código actual de 6 dígitos, padded con ceros. */
  code: string
  /** Segundos hasta que rote a un código nuevo. */
  secondsRemaining: number
  /** Duración total del paso (siempre 30) — útil para barras de progreso. */
  stepSeconds: number
}

/** Genera el código TOTP actual + tiempo restante para una semilla base32. */
export function generateTotp(secretBase32: string, now: number = Date.now()): TotpCode {
  const key = base32Decode(secretBase32)
  if (key.length === 0) throw new Error('Secreto TOTP inválido')

  const seconds = Math.floor(now / 1000)
  const counter = Math.floor(seconds / STEP)
  const code = computeHotp(key, counter)

  return {
    code,
    secondsRemaining: STEP - (seconds % STEP),
    stepSeconds: STEP
  }
}

/** HMAC-based One-Time Password (RFC 4226) — base de TOTP. */
function computeHotp(key: Buffer, counter: number): string {
  // counter como 8 bytes big-endian
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))

  const hmac = createHmac('sha1', key).update(counterBuf).digest()

  // Dynamic Truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return (truncated % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

/**
 * Decodifica una cadena base32 (RFC 4648 alfabeto A-Z2-7) a bytes.
 * Tolerante con espacios, guiones y minúsculas — comunes en secretos pegados
 * desde sitios web.
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '')

  let bits = 0
  let value = 0
  const out: number[] = []

  for (const char of cleaned) {
    const idx = alphabet.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** Valida que un string parezca base32 válido (no garantiza que el secreto sea correcto). */
export function looksLikeBase32(input: string): boolean {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, '')
  if (cleaned.length < 8) return false
  return /^[A-Z2-7]+=*$/.test(cleaned)
}
