import { ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'

export interface PasswordStrength {
  score: number          // 0-4
  label: 'Muy débil' | 'Débil' | 'Regular' | 'Fuerte' | 'Muy fuerte'
  color: string
  feedback: string[]
}

const UPPER  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER  = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'

function secureRandom(max: number): number {
  const bytes = randomBytes(4)
  return bytes.readUInt32BE(0) % max
}

function generatePassword(length: number): string {
  const allChars = UPPER + LOWER + DIGITS + SYMBOLS

  // Guarantee at least one of each required set
  const required = [
    UPPER[secureRandom(UPPER.length)],
    LOWER[secureRandom(LOWER.length)],
    DIGITS[secureRandom(DIGITS.length)],
    SYMBOLS[secureRandom(SYMBOLS.length)]
  ]

  const rest = Array.from({ length: length - 4 }, () => allChars[secureRandom(allChars.length)])
  const combined = [...required, ...rest]

  // Fisher-Yates shuffle using secure random
  for (let i = combined.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1)
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }

  return combined.join('')
}

export function evaluatePassword(password: string): PasswordStrength {
  const feedback: string[] = []
  let score = 0

  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  else if (password.length < 12) feedback.push('Usa al menos 12 caracteres')

  const hasUpper   = /[A-Z]/.test(password)
  const hasLower   = /[a-z]/.test(password)
  const hasDigit   = /[0-9]/.test(password)
  const hasSymbol  = /[^A-Za-z0-9]/.test(password)
  const hasCommon  = /^(123|abc|password|qwerty)/i.test(password)

  if (hasUpper && hasLower && hasDigit && hasSymbol) score++
  if (!hasUpper)  feedback.push('Añade letras mayúsculas')
  if (!hasLower)  feedback.push('Añade letras minúsculas')
  if (!hasDigit)  feedback.push('Añade números')
  if (!hasSymbol) feedback.push('Añade símbolos (!@#$...)')
  if (hasCommon)  { score = Math.max(0, score - 1); feedback.push('Evita patrones comunes') }

  const clampedScore = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4

  const labels: PasswordStrength['label'][] = ['Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte']
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']

  return {
    score: clampedScore,
    label: labels[clampedScore],
    color: colors[clampedScore],
    feedback
  }
}

export function registerGeneratorHandlers(): void {
  ipcMain.handle('generator:generate', (_event, length: number) => {
    const safeLength = Math.max(10, Math.min(48, length))
    return generatePassword(safeLength)
  })

  ipcMain.handle('generator:evaluate', (_event, password: string) => {
    return evaluatePassword(password)
  })
}
