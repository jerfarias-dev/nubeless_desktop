import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { SyncAccount, SyncCategory } from '../sync/mergeService'

/**
 * Respaldo portátil `.nubeless` — mismo formato en desktop y móvil
 * (lib/features/backup/portable_backup.dart). Contrato en ../AGENTS.md §11.
 *
 *   {
 *     "format": "nubeless-backup",
 *     "v": 1,
 *     "createdAt": ISO-8601,
 *     "kdf": { "alg": "PBKDF2-SHA512", "iter": 600000, "salt": base64(32 bytes) },
 *     "data": base64( iv[12] + tag[16] + ciphertext )   ← layout DESKTOP
 *   }
 *
 * `data` descifrado = JSON { accounts: SyncAccount[], categories: SyncCategory[],
 * exportedAt, v: 1 } — el mismo "inner JSON" del sync (con lápidas). Se cifra
 * con una contraseña de respaldo elegida al exportar, NO con la maestra, para
 * que el archivo se pueda abrir en otro dispositivo.
 */

export const BACKUP_FORMAT = 'nubeless-backup'
export const BACKUP_VERSION = 1
export const BACKUP_KDF_ITERATIONS = 600_000
export const BACKUP_MIN_PASSWORD = 8

export interface PortableBackupFile {
  format: typeof BACKUP_FORMAT
  v: number
  createdAt: string
  kdf: { alg: 'PBKDF2-SHA512'; iter: number; salt: string }
  data: string
}

export interface PortableState {
  accounts: SyncAccount[]
  categories: SyncCategory[]
  exportedAt?: string
  v: number
}

export class WrongBackupPasswordError extends Error {
  constructor() { super('Contraseña del respaldo incorrecta') }
}

function deriveKey(password: string, salt: Buffer, iter: number): Buffer {
  return pbkdf2Sync(password, salt, iter, 32, 'sha512')
}

/** `salt` e `iv` son inyectables solo para el vector de interop de los tests. */
export function buildBackup(
  state: PortableState,
  password: string,
  opts: { salt?: Buffer; iv?: Buffer; createdAt?: string } = {},
): PortableBackupFile {
  if (password.length < BACKUP_MIN_PASSWORD) {
    throw new Error(`La contraseña del respaldo debe tener al menos ${BACKUP_MIN_PASSWORD} caracteres`)
  }
  const salt = opts.salt ?? randomBytes(32)
  const iv = opts.iv ?? randomBytes(12)
  const key = deriveKey(password, salt, BACKUP_KDF_ITERATIONS)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()])
  const data = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
  key.fill(0)
  return {
    format: BACKUP_FORMAT,
    v: BACKUP_VERSION,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    kdf: { alg: 'PBKDF2-SHA512', iter: BACKUP_KDF_ITERATIONS, salt: salt.toString('base64') },
    data,
  }
}

export function openBackup(fileText: string, password: string): PortableState {
  let file: PortableBackupFile
  try {
    file = JSON.parse(fileText)
  } catch {
    throw new Error('El archivo no es un respaldo de Nubeless')
  }
  if (file?.format !== BACKUP_FORMAT) throw new Error('El archivo no es un respaldo de Nubeless')
  if (file.v > BACKUP_VERSION) throw new Error('El respaldo es de una versión más nueva de Nubeless. Actualiza la app.')
  if (file.kdf?.alg !== 'PBKDF2-SHA512') throw new Error('Respaldo con un formato de clave no soportado')

  const key = deriveKey(password, Buffer.from(file.kdf.salt, 'base64'), file.kdf.iter)
  const raw = Buffer.from(file.data, 'base64')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const plain = decipher.update(raw.subarray(28)) + decipher.final('utf8')
    const state = JSON.parse(plain) as PortableState
    if (!Array.isArray(state.accounts) || !Array.isArray(state.categories)) {
      throw new Error('Respaldo dañado')
    }
    return state
  } catch (e) {
    if (e instanceof Error && e.message === 'Respaldo dañado') throw e
    throw new WrongBackupPasswordError()
  } finally {
    key.fill(0)
  }
}
