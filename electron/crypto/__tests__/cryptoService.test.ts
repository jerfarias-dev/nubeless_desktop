import { describe, test, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CryptoService } from '../cryptoService'

describe('CryptoService — primitivas encrypt/decrypt', () => {
  // Usamos un tmpdir distinto por suite — la clase quiere paths para salt/verify
  // pero los métodos primitivos no los tocan, así que puede vivir en /tmp.
  let crypto: CryptoService
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pm-crypto-test-'))
    crypto = new CryptoService(tmpDir)
  })

  test('roundtrip de un string corto', () => {
    const key = randomBytes(32)
    const cipher = crypto.encrypt('hola mundo', key)
    expect(cipher).not.toBe('hola mundo')
    expect(crypto.decrypt(cipher, key)).toBe('hola mundo')
  })

  test('roundtrip de string vacío', () => {
    const key = randomBytes(32)
    const cipher = crypto.encrypt('', key)
    expect(crypto.decrypt(cipher, key)).toBe('')
  })

  test('roundtrip de texto largo con UTF-8 multi-byte', () => {
    const key = randomBytes(32)
    const plain = '🔐 contraseña súper privada con emojis 你好 العالم'.repeat(10)
    const cipher = crypto.encrypt(plain, key)
    expect(crypto.decrypt(cipher, key)).toBe(plain)
  })

  test('cifrados con misma key + mismo plaintext son DISTINTOS (IV random)', () => {
    const key = randomBytes(32)
    const c1 = crypto.encrypt('msg', key)
    const c2 = crypto.encrypt('msg', key)
    expect(c1).not.toBe(c2)
    // pero ambos descifran al mismo plaintext
    expect(crypto.decrypt(c1, key)).toBe('msg')
    expect(crypto.decrypt(c2, key)).toBe('msg')
  })

  test('descifrar con key incorrecta tira error', () => {
    const k1 = randomBytes(32)
    const k2 = randomBytes(32)
    const cipher = crypto.encrypt('secreto', k1)
    expect(() => crypto.decrypt(cipher, k2)).toThrow()
  })

  test('ciphertext modificado (auth tag falla) tira error', () => {
    const key = randomBytes(32)
    const cipher = crypto.encrypt('secreto', key)
    // Voltear un bit del último char (el authTag está dentro del payload)
    const tampered = cipher.slice(0, -2) + (cipher.slice(-2) === 'AA' ? 'BB' : 'AA')
    expect(() => crypto.decrypt(tampered, key)).toThrow()
  })
})

describe('CryptoService — encryptWithKey / decryptWithKey (formato sync)', () => {
  let crypto: CryptoService

  beforeEach(() => {
    crypto = new CryptoService(mkdtempSync(join(tmpdir(), 'pm-sync-test-')))
  })

  test('roundtrip del formato wire (iv + authTag + ciphertext)', () => {
    const sessionKey = randomBytes(32)
    const payload = JSON.stringify({ accounts: [{ uuid: 'abc', platform: 'GitHub' }] })

    const cipher = crypto.encryptWithKey(payload, sessionKey)
    expect(crypto.decryptWithKey(cipher, sessionKey)).toBe(payload)
  })
})

describe('CryptoService — vault data (encryptVaultData/decryptVaultData)', () => {
  let crypto: CryptoService
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pm-vault-test-'))
    crypto = new CryptoService(tmpDir)
    crypto.createMasterPassword('correct-horse-battery-staple')
  })

  test('después de createMasterPassword el vault está unlocked', () => {
    expect(crypto.isUnlocked()).toBe(true)
  })

  test('roundtrip de datos del vault con master key', () => {
    const json = JSON.stringify({ version: 1, accounts: [{ id: 1 }] })
    const cipher = crypto.encryptVaultData(json)
    expect(crypto.decryptVaultData(cipher)).toBe(json)
  })

  test('logout limpia la clave y bloquea operaciones', () => {
    crypto.logout()
    expect(crypto.isUnlocked()).toBe(false)
    expect(() => crypto.encryptVaultData('x')).toThrow('locked')
  })
})

describe('CryptoService — auth flow (login/verify)', () => {
  let crypto: CryptoService

  beforeEach(() => {
    crypto = new CryptoService(mkdtempSync(join(tmpdir(), 'pm-auth-test-')))
    crypto.createMasterPassword('mi-pass-1234')
  })

  test('verifyPassword devuelve true con la contraseña correcta', () => {
    expect(crypto.verifyPassword('mi-pass-1234')).toBe(true)
  })

  test('verifyPassword devuelve false con la contraseña incorrecta', () => {
    expect(crypto.verifyPassword('otra-cosa')).toBe(false)
  })

  test('login con pwd correcta desbloquea', () => {
    crypto.logout()
    expect(crypto.isUnlocked()).toBe(false)
    expect(crypto.login('mi-pass-1234')).toBe(true)
    expect(crypto.isUnlocked()).toBe(true)
  })

  test('login con pwd incorrecta no desbloquea y devuelve false', () => {
    crypto.logout()
    expect(crypto.login('wrong')).toBe(false)
    expect(crypto.isUnlocked()).toBe(false)
  })
})

describe('CryptoService — formato compatible con móvil (Dart)', () => {
  test('encryptWithKey produce formato iv[12] + tag[16] + ciphertext', () => {
    const crypto = new CryptoService(mkdtempSync(join(tmpdir(), 'pm-fmt-test-')))
    const key = randomBytes(32)
    const cipher = crypto.encryptWithKey('hello', key)
    const bytes = Buffer.from(cipher, 'base64')

    // 12 (iv) + 16 (authTag) + N (ciphertext, N>=1)
    expect(bytes.length).toBeGreaterThanOrEqual(12 + 16 + 1)
    // El móvil con decryptDesktopFormat lee EXACTAMENTE este layout —
    // si esto cambia, rompe la interop con Flutter.
  })
})
