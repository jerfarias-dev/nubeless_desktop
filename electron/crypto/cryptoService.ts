import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv
} from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_DIGEST = 'sha512'
const SALT_LENGTH = 32
const VERIFY_PLAINTEXT = 'PASSWORD_MANAGER_OK'

export class CryptoService {
  private derivedKey: Buffer | null = null
  private readonly saltPath: string
  private readonly verifyPath: string

  constructor(userDataPath: string) {
    this.saltPath = join(userDataPath, 'salt')
    this.verifyPath = join(userDataPath, 'verify')
  }

  // --- Salt management ---

  private loadOrCreateSalt(): Buffer {
    if (existsSync(this.saltPath)) {
      return readFileSync(this.saltPath)
    }
    const salt = randomBytes(SALT_LENGTH)
    writeFileSync(this.saltPath, salt)
    return salt
  }

  private getSalt(): Buffer {
    if (!existsSync(this.saltPath)) {
      throw new Error('Salt file not found')
    }
    return readFileSync(this.saltPath)
  }

  // --- Key derivation ---

  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST)
  }

  // --- Encrypt / Decrypt primitives ---

  encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    // Format: base64( iv[12] + authTag[16] + ciphertext )
    const combined = Buffer.concat([iv, authTag, encrypted])
    return combined.toString('base64')
  }

  decrypt(ciphertext: string, key: Buffer): string {
    const combined = Buffer.from(ciphertext, 'base64')
    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }

  // --- Auth flow ---

  isFirstTime(): boolean {
    return !existsSync(this.saltPath) || !existsSync(this.verifyPath)
  }

  createMasterPassword(password: string): void {
    const salt = this.loadOrCreateSalt()
    const key = this.deriveKey(password, salt)
    const verifyToken = this.encrypt(VERIFY_PLAINTEXT, key)
    writeFileSync(this.verifyPath, verifyToken, 'utf8')
    this.derivedKey = key
  }

  login(password: string): boolean {
    try {
      const salt = this.getSalt()
      const key = this.deriveKey(password, salt)
      const verifyToken = readFileSync(this.verifyPath, 'utf8')
      const decrypted = this.decrypt(verifyToken, key)
      if (decrypted === VERIFY_PLAINTEXT) {
        this.derivedKey = key
        return true
      }
      return false
    } catch {
      return false
    }
  }

  logout(): void {
    if (this.derivedKey) {
      this.derivedKey.fill(0)
      this.derivedKey = null
    }
  }

  verifyPassword(password: string): boolean {
    try {
      const salt = this.getSalt()
      const key = this.deriveKey(password, salt)
      const verifyToken = readFileSync(this.verifyPath, 'utf8')
      const decrypted = this.decrypt(verifyToken, key)
      key.fill(0)
      return decrypted === VERIFY_PLAINTEXT
    } catch {
      return false
    }
  }

  isUnlocked(): boolean {
    return this.derivedKey !== null
  }

  // --- Encrypt/decrypt account passwords using session key ---

  encryptPassword(plaintext: string): string {
    if (!this.derivedKey) throw new Error('Vault is locked')
    return this.encrypt(plaintext, this.derivedKey)
  }

  decryptPassword(ciphertext: string): string {
    if (!this.derivedKey) throw new Error('Vault is locked')
    return this.decrypt(ciphertext, this.derivedKey)
  }

  // --- Generic key-based encrypt/decrypt (used for sync session) ---

  encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  decryptWithKey(ciphertext64: string, key: Buffer): string {
    const combined = Buffer.from(ciphertext64, 'base64')
    const iv      = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }

  // --- Master password change ---

  /**
   * Cambia la contraseña maestra: re-deriva con un nuevo salt y delega al
   * orchestrator el re-cifrado de TODOS los campos cifrados del vault.
   *
   * El orchestrator recibe `oldKey` y `newKey` y es responsable de:
   *  - Leer todos los datos del DB (cuentas, sus passwords, totp_secrets, etc.)
   *  - Descifrar con oldKey y re-cifrar con newKey
   *  - Persistir los cambios en una transacción
   *
   * Devuelve `false` si la contraseña vieja es incorrecta. Lanza si algo falla
   * durante el re-cifrado o las escrituras a disco — el llamador debe asegurarse
   * de haber tomado un backup defensivo antes.
   */
  changeMasterPassword(
    oldPassword: string,
    newPassword: string,
    reEncryptVaultData: (oldKey: Buffer, newKey: Buffer) => void
  ): boolean {
    if (!this.verifyPassword(oldPassword)) return false
    if (!this.derivedKey) throw new Error('Vault is locked')

    const oldKey = this.derivedKey

    // 1. Nuevo salt + clave nueva
    const newSalt = randomBytes(SALT_LENGTH)
    const newKey  = this.deriveKey(newPassword, newSalt)
    const newVerify = this.encrypt(VERIFY_PLAINTEXT, newKey)

    // 2. El orchestrator re-cifra TODOS los campos cifrados en una transacción.
    //    Si falla aquí, no hemos tocado salt ni verify todavía → el vault sigue
    //    siendo accesible con la contraseña vieja.
    reEncryptVaultData(oldKey, newKey)

    // 3. Punto de no retorno: persistir salt y verify nuevos
    writeFileSync(this.saltPath, newSalt)
    writeFileSync(this.verifyPath, newVerify, 'utf8')

    // 4. Swap key en memoria + limpieza de la vieja
    oldKey.fill(0)
    this.derivedKey = newKey
    return true
  }

  // --- Export/import vault ---

  encryptVaultData(jsonData: string): Buffer {
    if (!this.derivedKey) throw new Error('Vault is locked')
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv)
    const encrypted = Buffer.concat([cipher.update(jsonData, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, encrypted])
  }

  decryptVaultData(data: Buffer): string {
    if (!this.derivedKey) throw new Error('Vault is locked')
    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }
}
